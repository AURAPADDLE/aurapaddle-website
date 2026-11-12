#!/usr/bin/env python3
"""Build AURA's reviewed promotion geography from official ABS allocation files.

The output classifies AURA promotion/standard-rate geography. It is not a
carrier service-area or carrier-price table.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    values: list[str] = []
    with archive.open("xl/sharedStrings.xml") as source:
        for event, element in ET.iterparse(source, events=("end",)):
            if element.tag == f"{NS}si":
                values.append("".join(node.text or "" for node in element.iter(f"{NS}t")))
                element.clear()
    return values


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - 64
    return result - 1


def worksheet_rows(path: Path):
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        header: list[str] | None = None
        with archive.open("xl/worksheets/sheet1.xml") as source:
            for event, row in ET.iterparse(source, events=("end",)):
                if row.tag != f"{NS}row":
                    continue
                cells: dict[int, str] = {}
                for cell in row.findall(f"{NS}c"):
                    value_node = cell.find(f"{NS}v")
                    if value_node is None:
                        continue
                    value = value_node.text or ""
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    cells[column_index(cell.get("r", "A1"))] = value
                if header is None:
                    width = max(cells, default=-1) + 1
                    header = [cells.get(index, "") for index in range(width)]
                else:
                    yield {name: cells.get(index, "") for index, name in enumerate(header) if name}
                row.clear()


def request_json(url: str, data: dict[str, str] | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data else None
    request = urllib.request.Request(url, data=body, headers={"User-Agent": "AURA-PADDLE-geography-builder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def canberra_sal_codes() -> set[str]:
    ucl_url = (
        "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/UCL/MapServer/0/query"
        "?where=ucl_code_2021%3D%27802001%27&outFields=ucl_code_2021"
        "&returnGeometry=true&outSR=4283&f=json"
    )
    ucl = request_json(ucl_url)
    geometry = ucl["features"][0]["geometry"]
    sal = request_json(
        "https://geo.abs.gov.au/arcgis/rest/services/ASGS2026/SAL/MapServer/0/query",
        {
            "geometry": json.dumps(geometry, separators=(",", ":")),
            "geometryType": "esriGeometryPolygon",
            "inSR": "4283",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "SAL_CODE_2026,SAL_NAME_2026,STATE_CODE_2026",
            "returnGeometry": "false",
            "resultRecordCount": "2000",
            "f": "json",
        },
    )
    return {
        str(item["attributes"]["SAL_CODE_2026"])
        for item in sal.get("features", [])
        if str(item["attributes"].get("STATE_CODE_2026")) == "8"
        and not str(item["attributes"].get("SAL_NAME_2026", "")).startswith("ACT Remainder")
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mb", type=Path, required=True)
    parser.add_argument("--lga", type=Path, required=True)
    parser.add_argument("--sal", type=Path, required=True)
    parser.add_argument("--poa", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    gccsa_by_mb: dict[str, str] = {}
    state_by_mb: dict[str, str] = {}
    for row in worksheet_rows(args.mb):
        mb = row.get("MB_CODE_2026", "")
        if mb:
            gccsa_by_mb[mb] = row.get("GCCSA_CODE_2026", "")
            state_by_mb[mb] = row.get("STATE_CODE_2026", "")

    gold_coast_mbs = {
        row.get("MB_CODE_2026", "")
        for row in worksheet_rows(args.lga)
        if row.get("LGA_CODE_2026") == "33430"
    }
    sal_by_mb: dict[str, tuple[str, str, str]] = {}
    for row in worksheet_rows(args.sal):
        mb = row.get("MB_CODE_2026", "")
        if mb:
            sal_by_mb[mb] = (
                row.get("SAL_CODE_2026", ""),
                row.get("SAL_NAME_2026", ""),
                row.get("STATE_CODE_2026", ""),
            )

    canberra_sals = canberra_sal_codes()
    group_by_gccsa = {
        "3GBRI": "brisbane",
        "1GSYD": "sydney",
        "2GMEL": "melbourne",
        "4GADE": "adelaide-paid",
        "5GPER": "perth-paid",
    }
    pairs: dict[tuple[str, str, str], dict[str, object]] = defaultdict(lambda: {"groups": set(), "outside": False})
    for row in worksheet_rows(args.poa):
        mb = row.get("MB_CODE_2026", "")
        postcode = row.get("POA_CODE_2026", "")
        sal = sal_by_mb.get(mb)
        if not sal or not re.fullmatch(r"\d{4}", postcode):
            continue
        sal_code, suburb, state = sal
        if not suburb or not state or suburb.startswith("No usual address") or suburb.startswith("Migratory"):
            continue
        if mb in gold_coast_mbs:
            group = "gold-coast"
        elif sal_code in canberra_sals and state == "8":
            group = "canberra"
        elif state_by_mb.get(mb) == "6":
            group = "tasmania-paid"
        else:
            group = group_by_gccsa.get(gccsa_by_mb.get(mb, ""))
        key = (suburb, state, postcode)
        if group:
            pairs[key]["groups"].add(group)
        else:
            pairs[key]["outside"] = True

    state_names = {"1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "8": "ACT"}
    settings = {
        "gold-coast": ("Gold Coast", "gold-coast-brisbane", "coastgo-standard", False, True),
        "brisbane": ("Brisbane metro", "gold-coast-brisbane", "coastgo-standard", False, True),
        "sydney": ("Sydney metro", "qld-nsw-main", "coastgo-metro", True, True),
        "canberra": ("Canberra urban area", "qld-nsw-main", "coastgo-metro", True, True),
        "melbourne": ("Melbourne metro", "qld-nsw-main", "coastgo-metro", True, True),
        "adelaide-paid": ("Adelaide metro", "adelaide", "coastgo-standard", False, False),
        "perth-paid": ("Perth metro", "perth", "coastgo-standard", False, False),
        "tasmania-paid": ("Tasmania", "tasmania", "coastgo-standard", False, False),
    }
    locations = []
    ambiguous = 0
    for (suburb, state_code, postcode), result in pairs.items():
        groups = result["groups"]
        if result["outside"] or len(groups) != 1:
            if groups:
                ambiguous += 1
            continue
        group = next(iter(groups))
        label, yoga_region, coastgo_region, express, free = settings[group]
        locations.append(
            {
                "suburb": suburb,
                "state": state_names[state_code],
                "postcode": postcode,
                "auraArea": group,
                "auraAreaLabel": label,
                "yogaRegionId": yoga_region,
                "coastGoRegionId": coastgo_region,
                "coastGoExpressEligible": express,
                "freeShippingEligible": free,
                "reviewed": True,
                "source": "AURA promotion geography derived from ABS ASGS allocation data",
                "effectiveFrom": "2026-11-12",
            }
        )
    locations.sort(key=lambda item: (item["state"], item["postcode"], item["suburb"]))
    output = {
        "status": "approved",
        "version": "aura-promotion-geography-2026-11-12-v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "purpose": "AURA promotion and published-rate geography only; not carrier coverage or a carrier price guarantee.",
        "promotion": {
            "startsAt": "2026-11-12T00:00:00+10:00",
            "endsAt": "2026-12-01T00:00:00+10:00",
            "freeAreas": ["gold-coast", "brisbane", "sydney", "canberra", "melbourne"],
        },
        "sources": {
            "mb": "ABS ASGS Edition 4 MB_2026_AUST.xlsx",
            "lga": "ABS ASGS Edition 4 LGA_2026_AUST.xlsx; Gold Coast LGA 33430",
            "poa": "ABS ASGS Edition 4 POA_2026_AUST.xlsx",
            "sal": "ABS ASGS Edition 4 SAL_2026_AUST.xlsx",
            "canberra": "ABS ASGS Edition 3 UCL 802001, Canberra - Queanbeyan (Canberra Part), intersected with 2026 ACT SALs; ACT Remainder excluded",
        },
        "boundaryPolicy": "A suburb/state/postcode pair crossing an approved or paid-area boundary is omitted and requires manual confirmation.",
        "ambiguousPairCount": ambiguous,
        "locations": locations,
    }
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"locations": len(locations), "ambiguous": ambiguous, "byArea": {key: sum(1 for item in locations if item["auraArea"] == key) for key in settings}}, indent=2))


if __name__ == "__main__":
    main()
