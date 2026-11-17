#!/usr/bin/env python3
"""Build AURA's reviewed promotion geography from official ABS allocation files.

The output classifies AURA promotion/standard-rate geography. It is not a
carrier service-area or carrier-price table.
"""

from __future__ import annotations

import argparse
import json
import re
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


def ucl_delivery_pairs(mb_path: Path, ucl_path: Path, sal_path: Path, poa_path: Path) -> dict[tuple[str, str, str], str]:
    """Return unambiguous 2021 suburb/state/postcode pairs inside approved UCLs.

    UCL is an exact 2021 SA1 allocation. A pair is accepted only when it has an
    urban Mesh Block and no non-urban block other than Water, Parkland or
    Transport. Mixed urban/rural pairs therefore fall back to manual review.
    """
    group_by_ucl = {"302001": "gold-coast", "802001": "canberra"}
    group_by_sa1 = {
        row.get("SA1_CODE_2021", ""): group_by_ucl[row.get("UCL_CODE_2021", "")]
        for row in worksheet_rows(ucl_path)
        if row.get("UCL_CODE_2021") in group_by_ucl
    }
    mb_info = {
        row.get("MB_CODE_2021", ""): (group_by_sa1.get(row.get("SA1_CODE_2021", "")), row.get("MB_CATEGORY_2021", ""))
        for row in worksheet_rows(mb_path)
        if row.get("MB_CODE_2021")
    }
    sal_by_mb = {
        row.get("MB_CODE_2021", ""): (row.get("SAL_NAME_2021", ""), row.get("STATE_CODE_2021", ""))
        for row in worksheet_rows(sal_path)
        if row.get("MB_CODE_2021")
    }
    harmless_outside_categories = {"Water", "Parkland", "Transport"}
    pairs: dict[tuple[str, str, str], dict[str, object]] = defaultdict(lambda: {"groups": set(), "outside": False})
    for row in worksheet_rows(poa_path):
        mb = row.get("MB_CODE_2021", "")
        sal = sal_by_mb.get(mb)
        info = mb_info.get(mb)
        postcode = row.get("POA_CODE_2021", "")
        if not sal or not info or not re.fullmatch(r"\d{4}", postcode):
            continue
        suburb, state = sal
        group, category = info
        key = (suburb, state, postcode)
        if group:
            pairs[key]["groups"].add(group)
        elif category not in harmless_outside_categories:
            pairs[key]["outside"] = True
    return {
        key: next(iter(result["groups"]))
        for key, result in pairs.items()
        if not result["outside"] and len(result["groups"]) == 1
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mb", type=Path, required=True)
    parser.add_argument("--sal", type=Path, required=True)
    parser.add_argument("--poa", type=Path, required=True)
    parser.add_argument("--mb-2021", type=Path, required=True)
    parser.add_argument("--ucl-2021", type=Path, required=True)
    parser.add_argument("--sal-2021", type=Path, required=True)
    parser.add_argument("--poa-2021", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    gccsa_by_mb: dict[str, str] = {}
    state_by_mb: dict[str, str] = {}
    for row in worksheet_rows(args.mb):
        mb = row.get("MB_CODE_2026", "")
        if mb:
            gccsa_by_mb[mb] = row.get("GCCSA_CODE_2026", "")
            state_by_mb[mb] = row.get("STATE_CODE_2026", "")

    sal_by_mb: dict[str, tuple[str, str, str]] = {}
    for row in worksheet_rows(args.sal):
        mb = row.get("MB_CODE_2026", "")
        if mb:
            sal_by_mb[mb] = (
                row.get("SAL_CODE_2026", ""),
                row.get("SAL_NAME_2026", ""),
                row.get("STATE_CODE_2026", ""),
            )

    ucl_pairs = ucl_delivery_pairs(args.mb_2021, args.ucl_2021, args.sal_2021, args.poa_2021)
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
        _, suburb, state = sal
        if not suburb or not state or suburb.startswith("No usual address") or suburb.startswith("Migratory"):
            continue
        if (suburb, state, postcode) in ucl_pairs:
            group = ucl_pairs[(suburb, state, postcode)]
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
        "gold-coast": ("Gold Coast", "gold-coast-brisbane", "gold-coast-brisbane", False, True),
        "brisbane": ("Brisbane metro", "gold-coast-brisbane", "gold-coast-brisbane", False, True),
        "sydney": ("Sydney metro", "qld-nsw-main", "qld-nsw-main", True, True),
        "canberra": ("Canberra urban area", "qld-nsw-main", "qld-nsw-main", True, True),
        "melbourne": ("Melbourne metro", "qld-nsw-main", "qld-nsw-main", True, True),
        "adelaide-paid": ("Adelaide metro", "adelaide", "adelaide", False, False),
        "perth-paid": ("Perth metro", "perth", "perth", False, False),
        "tasmania-paid": ("Tasmania", "tasmania", "tasmania", False, False),
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
            "poa": "ABS ASGS Edition 4 POA_2026_AUST.xlsx",
            "sal": "ABS ASGS Edition 4 SAL_2026_AUST.xlsx",
            "goldCoast": "ABS ASGS Edition 3 UCL 302001, Gold Coast - Tweed Heads (Gold Coast Part), using same-edition 2021 SA1, Mesh Block, SAL and POA allocations; mixed urban/rural pairs are excluded",
            "canberra": "ABS ASGS Edition 3 UCL 802001, Canberra - Queanbeyan (Canberra Part), using same-edition 2021 SA1, Mesh Block, SAL and POA allocations; mixed urban/rural pairs are excluded",
        },
        "boundaryPolicy": "A suburb/state/postcode pair crossing an approved or paid-area boundary, including a mixed urban/rural Gold Coast or Canberra pair, is omitted and requires manual confirmation. Water, parkland and transport Mesh Blocks do not by themselves make an otherwise urban delivery pair ambiguous. ABS Postal Areas are statistical approximations, not proof that Australia Post accepts an address.",
        "ambiguousPairCount": ambiguous,
        "locations": locations,
    }
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"locations": len(locations), "ambiguous": ambiguous, "byArea": {key: sum(1 for item in locations if item["auraArea"] == key) for key in settings}}, indent=2))


if __name__ == "__main__":
    main()
