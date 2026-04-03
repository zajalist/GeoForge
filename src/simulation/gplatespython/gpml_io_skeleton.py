"""GPML I/O for gplatespython integration.

Handles both GPlates native export format and manual GeoForge exports.
"""

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

GPML_NS_GPLATES = "http://www.gplates.org/gplates"
GPML_NS_GPML = "http://www.gplates.org/gpml"
GML_NS = "http://www.opengis.net/gml"
XLINK_NS = "http://www.w3.org/1999/xlink"

NS_MAP = {
    "gpml": GPML_NS_GPLATES,
    "gml": GML_NS,
    "xlink": XLINK_NS,
}


@dataclass
class GpmlFeature:
    """Represents a single parsed GPML feature."""

    feature_id: str
    feature_type: str
    name: str = ""
    description: str = ""
    plate_id: Optional[int] = None
    valid_from: Optional[float] = None
    valid_to: Optional[float] = None
    geometry_type: str = ""
    coordinates: list[list[float]] = field(default_factory=list)
    properties: dict = field(default_factory=dict)
    reconstruction_plate_id: Optional[int] = None
    topological_elements: list = field(default_factory=list)
    children: list["GpmlFeature"] = field(default_factory=list)


def _parse_pos_list(pos_list_elem) -> list[list[float]]:
    """Parse a gml:posList element into [[lon, lat], ...]."""
    text = pos_list_elem.text or ""
    tokens = text.strip().split()
    coords = []
    i = 0
    while i + 1 < len(tokens):
        lon = float(tokens[i])
        lat = float(tokens[i + 1])
        coords.append([lon, lat])
        i += 2
    return coords


def _parse_geometry(feature_elem) -> tuple[str, list[list[float]]]:
    """Extract geometry type and coordinates from a feature element.

    Handles multiple nesting patterns:
      1. <gpml:geometry><gml:Polygon>...<gml:posList>
      2. <gml:Polygon>...<gml:posList> (direct)
      3. <gpml:Polygon>...<gml:posList>
    """
    for ns_prefix, ns_uri in [("gml", GML_NS), ("gpml", GPML_NS_GPLATES)]:
        for geom_tag in ["Polygon", "Polyline", "Point", "MultiPoint"]:
            xpath = f".//{{{ns_uri}}}{geom_tag}"
            elem = feature_elem.find(xpath)
            if elem is not None:
                pos_list = elem.find(f".//{{{GML_NS}}}posList")
                if pos_list is not None and pos_list.text:
                    return geom_tag.lower(), _parse_pos_list(pos_list)
                coords_elem = elem.find(f".//{{{GML_NS}}}coordinates")
                if coords_elem is not None and coords_elem.text:
                    raw = coords_elem.text.strip()
                    pts = []
                    for pair in raw.split():
                        parts = pair.split(",")
                        if len(parts) == 2:
                            pts.append([float(parts[0]), float(parts[1])])
                    return geom_tag.lower(), pts

    pos_list_any = feature_elem.find(".//gml:posList", NS_MAP)
    if pos_list_any is not None and pos_list_any.text:
        return "unknown", _parse_pos_list(pos_list_any)

    return "", []


def _parse_reconstruction_plate_id(feature_elem) -> Optional[int]:
    """Extract reconstruction plate ID from a feature.

    Handles:
      1. <gpml:reconstructionPlateId>0</gpml:reconstructionPlateId> (plain text)
      2. <gpml:reconstructionPlateId><gml:identifier>0</gml:identifier></gpml:reconstructionPlateId>
      3. attribute form
    """
    for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML]:
        elem = feature_elem.find(f".//{{{ns_uri}}}reconstructionPlateId")
        if elem is not None:
            if elem.text and elem.text.strip():
                try:
                    return int(elem.text.strip())
                except ValueError:
                    pass
            gml_id_elem = elem.find(f".//{{{GML_NS}}}identifier")
            if gml_id_elem is not None and gml_id_elem.text:
                try:
                    return int(gml_id_elem.text.strip())
                except ValueError:
                    pass
            code_elem = elem.find(f".//{{{GML_NS}}}identifier")
            if code_elem is not None:
                code = code_elem.get("codeSpace")
                if code_elem.text:
                    try:
                        return int(code_elem.text.strip())
                    except ValueError:
                        pass

    for attr_name in ["reconstructionPlateId"]:
        for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML]:
            val = feature_elem.get(f"{{{ns_uri}}}{attr_name}")
            if val is not None:
                try:
                    return int(val)
                except ValueError:
                    pass

    return None


def _parse_time_range(feature_elem) -> tuple[Optional[float], Optional[float]]:
    """Extract validFrom and validTo times from a feature.

    Handles:
      1. <gpml:validTime><gpml:TimePeriod><gpml:begin>0</gpml:begin><gpml:end>1000</gpml:end></gpml:TimePeriod></gpml:validTime>
      2. <gpml:validTime><gml:TimePeriod><gml:beginPosition>0</gml:beginPosition><gml:endPosition>1000</gml:endPosition></gml:TimePeriod></gpml:validTime>
      3. attribute form
    """
    valid_from = None
    valid_to = None

    for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML]:
        time_elem = feature_elem.find(f".//{{{ns_uri}}}validTime")
        if time_elem is None:
            continue

        for child in time_elem.iter():
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag in ("begin", "beginPosition") and child.text:
                try:
                    valid_from = float(child.text.strip())
                except ValueError:
                    pass
            elif tag in ("end", "endPosition") and child.text:
                try:
                    valid_to = float(child.text.strip())
                except ValueError:
                    pass

    if valid_from is None or valid_to is None:
        for attr, target in [("validFrom", "from"), ("validTo", "to")]:
            val = feature_elem.get(attr)
            if val is not None:
                try:
                    fval = float(val)
                    if target == "from":
                        valid_from = fval
                    else:
                        valid_to = fval
                except ValueError:
                    pass

    return valid_from, valid_to


def _parse_name(feature_elem) -> str:
    """Extract a human-readable name from a feature."""
    for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML, GML_NS]:
        name_elem = feature_elem.find(f".//{{{ns_uri}}}name")
        if name_elem is not None and name_elem.text:
            return name_elem.text.strip()
    return ""


def _parse_description(feature_elem) -> str:
    """Extract description from a feature."""
    for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML]:
        desc_elem = feature_elem.find(f".//{{{ns_uri}}}description")
        if desc_elem is not None and desc_elem.text:
            return desc_elem.text.strip()
    return ""


def _parse_properties(feature_elem) -> dict:
    """Extract additional properties from a feature."""
    props = {}
    skip_tags = {
        "geometry",
        "validTime",
        "name",
        "reconstructionPlateId",
        "featureId",
        "topologicalElements",
        "children",
        "description",
        "metadata",
        "featureMember",
        "TimePeriod",
    }
    for child in feature_elem:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag in skip_tags:
            continue
        if child.text and child.text.strip():
            props[tag] = child.text.strip()
    return props


def _parse_feature(feature_elem) -> GpmlFeature:
    """Parse a single GPML feature element."""
    tag = feature_elem.tag
    feature_type = tag.split("}")[-1] if "}" in tag else tag

    feature_id = ""
    for attr in ["gml:id", "id", "featureId"]:
        val = feature_elem.get(attr)
        if val:
            feature_id = val
            break
    if not feature_id:
        for ns_uri in [GPML_NS_GPLATES, GPML_NS_GPML, GML_NS]:
            val = feature_elem.get(f"{{{ns_uri}}}featureId") or feature_elem.get(
                f"{{{ns_uri}}}id"
            )
            if val:
                feature_id = val
                break

    geom_type, coordinates = _parse_geometry(feature_elem)
    valid_from, valid_to = _parse_time_range(feature_elem)
    plate_id = _parse_reconstruction_plate_id(feature_elem)
    name = _parse_name(feature_elem)
    description = _parse_description(feature_elem)
    properties = _parse_properties(feature_elem)

    children = []
    for child_elem in feature_elem:
        child_tag = (
            child_elem.tag.split("}")[-1] if "}" in child_elem.tag else child_elem.tag
        )
        if child_tag not in (
            "geometry",
            "validTime",
            "name",
            "reconstructionPlateId",
            "description",
            "metadata",
        ):
            if child_elem.get("gml:id") or child_elem.get("featureId"):
                children.append(_parse_feature(child_elem))

    return GpmlFeature(
        feature_id=feature_id,
        feature_type=feature_type,
        name=name,
        description=description,
        plate_id=plate_id,
        valid_from=valid_from,
        valid_to=valid_to,
        geometry_type=geom_type,
        coordinates=coordinates,
        properties=properties,
        reconstruction_plate_id=plate_id,
        children=children,
    )


def _find_feature_members(root) -> list:
    """Find all feature member elements regardless of namespace."""
    members = []
    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag == "featureMember":
            for child in elem:
                members.append(child)
    return members


def load_gpml_features(gpml_path: Path) -> list[GpmlFeature]:
    """Return parsed GPML features from disk.

    Handles both:
      - GPlates native format with <gpml:featureMember> wrappers
      - Flat feature collections
    """
    tree = ET.parse(str(gpml_path))
    root = tree.getroot()

    feature_elems = _find_feature_members(root)

    if not feature_elems:
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if elem.get("gml:id") or elem.get("featureId"):
                if tag not in ("FeatureCollection", "metadata", "Feature"):
                    feature_elems.append(elem)

    features = []
    for elem in feature_elems:
        try:
            features.append(_parse_feature(elem))
        except Exception:
            continue

    return features


def validate_feature_geometry(features: list[GpmlFeature]) -> list[str]:
    """Validate polygon closure, coordinate ranges, and required properties.

    Returns a list of warning/error strings. Empty list means all valid.
    """
    errors = []
    for feat in features:
        if not feat.coordinates:
            errors.append(f"Feature {feat.feature_id}: no coordinates")
            continue

        for i, (lon, lat) in enumerate(feat.coordinates):
            if lon < -180 or lon > 360:
                errors.append(
                    f"Feature {feat.feature_id}: longitude {lon} out of range at index {i}"
                )
            if lat < -90 or lat > 90:
                errors.append(
                    f"Feature {feat.feature_id}: latitude {lat} out of range at index {i}"
                )

        if feat.geometry_type == "polygon" and len(feat.coordinates) >= 3:
            first = feat.coordinates[0]
            last = feat.coordinates[-1]
            if first[0] != last[0] or first[1] != last[1]:
                errors.append(f"Feature {feat.feature_id}: polygon not closed")

        if feat.reconstruction_plate_id is None:
            errors.append(f"Feature {feat.feature_id}: missing reconstructionPlateId")

    return errors


def _build_gml_pos_list(coordinates: list[list[float]]) -> str:
    """Build a gml:posList text from coordinate pairs."""
    return " ".join(f"{lon} {lat}" for lon, lat in coordinates)


def _build_geometry_xml(geometry_type: str, coordinates: list[list[float]]) -> str:
    """Build the geometry XML fragment matching GPlates native format."""
    if not coordinates:
        return ""

    pos_text = _build_gml_pos_list(coordinates)

    if geometry_type == "polygon":
        return (
            f"    <gpml:geometry>\n"
            f'      <gml:Polygon srsName="urn:ogc:def:crs:EPSG::4326">\n'
            f"        <gml:exterior>\n"
            f"          <gml:LinearRing>\n"
            f"            <gml:posList>{pos_text}</gml:posList>\n"
            f"          </gml:LinearRing>\n"
            f"        </gml:exterior>\n"
            f"      </gml:Polygon>\n"
            f"    </gpml:geometry>"
        )
    elif geometry_type == "polyline":
        return (
            f"    <gpml:geometry>\n"
            f'      <gml:Polyline srsName="urn:ogc:def:crs:EPSG::4326">\n'
            f"        <gml:posList>{pos_text}</gml:posList>\n"
            f"      </gml:Polyline>\n"
            f"    </gpml:geometry>"
        )
    else:
        return (
            f"    <gpml:geometry>\n"
            f'      <gml:Point srsName="urn:ogc:def:crs:EPSG::4326">\n'
            f"        <gml:posList>{pos_text}</gml:posList>\n"
            f"      </gml:Point>\n"
            f"    </gpml:geometry>"
        )


def _build_rift_geometry_xml(coordinates: list[list[float]]) -> str:
    """Build geometry XML specifically for a rift polyline feature."""
    if not coordinates:
        return ""

    pos_text = _build_gml_pos_list(coordinates)
    return (
        f"    <gpml:geometry>\n"
        f'      <gml:Polyline srsName="urn:ogc:def:crs:EPSG::4326">\n'
        f"        <gml:posList>{pos_text}</gml:posList>\n"
        f"      </gml:Polyline>\n"
        f"    </gpml:geometry>"
    )


def save_gpml_features(features: list[GpmlFeature], output_path: Path) -> None:
    """Persist features to a GPML file on disk in GPlates-compatible format."""
    from datetime import datetime, timezone

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<gpml:FeatureCollection",
        '  xmlns:gpml="http://www.gplates.org/gplates"',
        '  xmlns:gml="http://www.opengis.net/gml"',
        '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '  xsi:schemaLocation="http://www.gplates.org/gplates gpml.xsd">',
        "  <gpml:metadata>",
        f"    <gpml:creator>GeoForge auto-rift export</gpml:creator>",
        f"    <gpml:created>{datetime.now(timezone.utc).isoformat()}</gpml:created>",
        "  </gpml:metadata>",
    ]

    for feat in features:
        fid = feat.feature_id or f"auto_{id(feat)}"
        lines.append(f"  <gpml:featureMember>")
        lines.append(f'    <gpml:{feat.feature_type} gml:id="{fid}">')

        if feat.name:
            lines.append(f"      <gpml:name>{feat.name}</gpml:name>")

        if feat.description:
            lines.append(
                f"      <gpml:description>{feat.description}</gpml:description>"
            )

        if feat.reconstruction_plate_id is not None:
            lines.append(
                f"      <gpml:reconstructionPlateId>{feat.reconstruction_plate_id}</gpml:reconstructionPlateId>"
            )

        if feat.valid_from is not None or feat.valid_to is not None:
            lines.append("      <gpml:validTime>")
            lines.append("        <gpml:TimePeriod>")
            lines.append(f"          <gpml:begin>{feat.valid_from or 0}</gpml:begin>")
            lines.append(f"          <gpml:end>{feat.valid_to or 0}</gpml:end>")
            lines.append("        </gpml:TimePeriod>")
            lines.append("      </gpml:validTime>")

        if feat.coordinates:
            geom_xml = _build_geometry_xml(feat.geometry_type, feat.coordinates)
            for geom_line in geom_xml.split("\n"):
                lines.append(f"      {geom_line}")

        for key, val in feat.properties.items():
            lines.append(f"      <gpml:{key}>{val}</gpml:{key}>")

        lines.append(f"    </gpml:{feat.feature_type}>")
        lines.append(f"  </gpml:featureMember>")

    lines.append("</gpml:FeatureCollection>")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
