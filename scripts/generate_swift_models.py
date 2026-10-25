#!/usr/bin/env python3
"""Generates the iOS app's API models from the OpenAPI spec.

Writes plain Codable types, namespaced under `API`, that the app's own
APIClient sends and receives. They're built to keep working against a newer
server:

- Responses decode with JSONDecoder.api (keys from snake_case, any date
  format). Lists of objects are @Lossy, so one item this build can't read
  doesn't blank a screen, and every enum decodes values it doesn't know to
  `.unknown`.
- Bodies encode with explicit snake_case keys and dates written per field:
  `date` as YYYY-MM-DD, `date-time` as ISO 8601. An optional field left nil
  is omitted, so the server's default applies.
- PATCH bodies hold each optional field as a double optional: nil leaves the
  field out (unchanged), `.some(nil)` sends an explicit null (cleared), which
  is what the API's exclude_unset updates expect.

Usage: scripts/generate_swift_models.py [spec] [output]
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "services/api/openapi.json"
OUTPUT = ROOT / "apps/ios/Bessel/API/Generated/APIModels.swift"

SWIFT_KEYWORDS = {
  "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import", "init", "inout",
  "internal", "let", "open", "operator", "private", "protocol", "public", "rethrows", "static", "struct",
  "subscript", "typealias", "var", "break", "case", "continue", "default", "defer", "do", "else", "fallthrough",
  "for", "guard", "if", "in", "repeat", "return", "switch", "where", "while", "as", "catch", "false", "is", "nil",
  "super", "self", "Self", "throw", "throws", "true", "try", "Type", "Any", "Protocol",
}  # fmt: skip


def swift_camel(key: str) -> str:
  """The property name JSONDecoder's convertFromSnakeCase matches `key` to."""
  first, *rest = key.split("_")
  return first + "".join(part.capitalize() for part in rest)


def identifier(name: str) -> str:
  return f"`{name}`" if name in SWIFT_KEYWORDS else name


def enum_case(raw: str) -> str:
  descending = raw.startswith("-")
  name = swift_camel(re.sub(r"[^a-z0-9_]", "_", raw.lstrip("-").lower()))
  if descending:
    name += "Descending"
  if not re.match(r"[a-z_]", name):
    name = "_" + name
  return identifier(name)


@dataclass(frozen=True)
class Field:
  key: str
  prop: str
  swift: str
  base: str
  mode: str  # required | defaulted | optional | double
  default: str | None
  date: str | None
  lossy: bool
  is_list: bool


def ref_name(node: dict) -> str | None:
  ref = node.get("$ref")
  return ref.rsplit("/", 1)[-1] if ref else None


class Generator:
  def __init__(self, spec: dict) -> None:
    self.schemas: dict[str, dict] = spec["components"]["schemas"]
    self.patch_bodies = self._patch_bodies(spec)
    self.uses_json_value = False

  @staticmethod
  def _patch_bodies(spec: dict) -> set[str]:
    names = set()
    for operations in spec["paths"].values():
      operation = operations.get("patch")
      if not operation:
        continue
      schema = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
      if name := ref_name(schema):
        names.add(name)
    return names

  def is_struct(self, name: str) -> bool:
    return "enum" not in self.schemas[name]

  # --- types -------------------------------------------------------------

  def non_null(self, node: dict) -> tuple[dict, bool]:
    """The schema without its `null` alternative, and whether it allowed null."""
    options = node.get("anyOf")
    if options is None:
      return node, node.get("type") == "null"
    rest = [option for option in options if option.get("type") != "null"]
    nullable = len(rest) < len(options)
    if len(rest) == 1:
      return rest[0], nullable
    return {"anyOf": rest}, nullable

  def swift_type(self, node: dict) -> str:
    node, _ = self.non_null(node)
    if name := ref_name(node):
      return name
    if "anyOf" in node:
      self.uses_json_value = True
      return "JSONValue"
    kind = node.get("type")
    fmt = node.get("format")
    if kind == "string":
      if fmt in ("uuid", "uuid4"):
        return "UUID"
      if fmt in ("date", "date-time"):
        return "Date"
      return "String"
    if kind == "integer":
      return "Int"
    if kind == "number":
      return "Double"
    if kind == "boolean":
      return "Bool"
    if kind == "array":
      return f"[{self.swift_type(node.get('items', {}))}]"
    if kind == "object":
      extra = node.get("additionalProperties")
      if isinstance(extra, dict) and extra:
        return f"[String: {self.swift_type(extra)}]"
    self.uses_json_value = True
    if kind == "object":
      return "[String: JSONValue]"
    return "JSONValue"

  def date_format(self, node: dict) -> str | None:
    """`date` or `date-time` when the field is a date or a list of them."""
    node, _ = self.non_null(node)
    if node.get("type") == "array":
      return self.date_format(node.get("items", {}))
    if node.get("type") == "string" and node.get("format") in ("date", "date-time"):
      return node["format"]
    return None

  def is_lossy(self, node: dict, optional: bool) -> bool:
    if optional or node.get("type") != "array":
      return False
    item = ref_name(node.get("items", {}))
    return item is not None and self.is_struct(item)

  # --- declarations ------------------------------------------------------

  def enum(self, name: str, schema: dict) -> str:
    values = schema["enum"]
    cases = [(enum_case(value), value) for value in values]
    lines = [f"    enum {name}: String, Codable, Hashable, CaseIterable, LenientEnum {{"]
    lines += [f'        case {case} = "{value}"' if case.strip("`") != value else f"        case {case}" for case, value in cases]
    if "unknown" not in values:
      lines.append("        /// A value added on the server after this build.")
      lines.append("        case unknown")
    lines.append(f"        static let allCases: [{name}] = [{', '.join('.' + case for case, _ in cases)}]")
    lines.append("    }")
    return "\n".join(lines)

  def default_literal(self, node: dict, swift: str) -> str | None:
    """A Swift literal for the field's default when it isn't nullable: its spec default, or [] for a list."""
    if "default" in node:
      value = node["default"]
      if value is None:
        return None
      if name := ref_name(node):
        return f".{enum_case(value)}" if not self.is_struct(name) else None
      if isinstance(value, bool):
        return "true" if value else "false"
      if isinstance(value, (int, float)):
        return repr(value)
      if isinstance(value, str):
        return json.dumps(value)
      if value == [] and swift.startswith("["):
        return "[]"
      return None
    if node.get("type") == "array":
      return "[]"
    return None

  def fields(self, name: str, schema: dict) -> list[Field]:
    patch = name in self.patch_bodies
    required = set(schema.get("required", []))
    fields = []
    for key, node in schema.get("properties", {}).items():
      inner, nullable = self.non_null(node)
      absent = key not in required
      base = self.swift_type(node)
      default = None
      if patch and absent and nullable:
        swift, mode = f"{base}??", "double"
      elif nullable:
        swift, mode = f"{base}?", "optional"
      elif absent and not patch and (default := self.default_literal(inner, base)) is not None:
        swift, mode = base, "defaulted"
      elif absent:
        swift, mode = f"{base}?", "optional"
      else:
        swift, mode = base, "required"
      lossy = not patch and mode in ("required", "defaulted") and self.is_lossy(inner, False)
      fields.append(
        Field(
          key=key,
          prop=identifier(swift_camel(key)),
          swift=swift,
          base=base,
          mode=mode,
          default=default,
          date=self.date_format(node),
          lossy=lossy,
          is_list=inner.get("type") == "array",
        )
      )
    return fields

  def struct(self, name: str, schema: dict) -> tuple[str, str]:
    """The declaration, inside `API`, and its coding extension at file scope (which keeps the memberwise init)."""
    patch = name in self.patch_bodies
    fields = self.fields(name, schema)
    protocols = "Encodable, Hashable" if patch else "Codable, Hashable"

    lines = [f"    struct {name}: {protocols} {{"]
    for f in fields:
      wrapper = "@Lossy " if f.lossy else ""
      default = f" = {f.default}" if f.default is not None else ""
      lines.append(f"        {wrapper}var {f.prop}: {f.swift}{default}")
    lines.append("    }")

    ext = [f"extension API.{name} {{"]
    if not patch:
      ext.append("    private enum DecodingKeys: String, CodingKey {")
      ext += [f"        case {f.prop}" for f in fields] or ["        case none"]
      ext.append("    }")
      ext.append("")
      ext.append("    init(from decoder: Decoder) throws {")
      if fields:
        ext.append("        let container = try decoder.container(keyedBy: DecodingKeys.self)")
      for f in fields:
        ext.append("        " + self.decode_line(f))
      ext.append("    }")
      ext.append("")
    if fields:
      ext.append("    private enum EncodingKeys: String, CodingKey {")
      for f in fields:
        ext.append(f'        case {f.prop} = "{f.key}"' if f.prop.strip("`") != f.key else f"        case {f.prop}")
      ext.append("    }")
      ext.append("")
      ext.append("    func encode(to encoder: Encoder) throws {")
      ext.append("        var container = encoder.container(keyedBy: EncodingKeys.self)")
      for f in fields:
        ext.append("        " + self.encode_line(f.prop, "required" if f.mode == "defaulted" else f.mode, f.date, f.is_list))
      ext.append("    }")
    else:
      ext.append("    func encode(to encoder: Encoder) throws {}")
    ext.append("}")
    return "\n".join(lines), "\n".join(ext)

  def qualified(self, swift: str) -> str:
    """`swift` with schema names spelled API.Name, for code outside the `API` namespace."""
    return re.sub(r"\b[A-Z][A-Za-z0-9]*\b", lambda m: f"API.{m[0]}" if m[0] in self.schemas or m[0] == "JSONValue" else m[0], swift)

  def decode_line(self, f: Field) -> str:
    """Keys come in already camelCased: JSONDecoder.api converts them from snake_case."""
    key = "." + f.prop
    target = f"self._{f.prop.strip('`')}" if f.lossy else f"self.{f.prop.strip('`')}"
    base = self.qualified(f.base)
    if f.lossy:
      return f"{target} = try container.decode(Lossy<{base[1:-1]}>.self, forKey: {key})"
    if f.mode == "required":
      return f"{target} = try container.decode({base}.self, forKey: {key})"
    if f.mode == "defaulted":
      return f"{target} = try container.decodeIfPresent({base}.self, forKey: {key}) ?? {f.default}"
    return f"{target} = try container.decodeIfPresent({base}.self, forKey: {key})"

  @staticmethod
  def encode_line(prop: str, mode: str, date: str | None, is_list: bool) -> str:
    key = "." + prop
    wrap = {"date": "API.Day", "date-time": "API.Instant"}.get(date or "")

    def dated(expression: str, optional: bool) -> str:
      if not wrap:
        return expression
      convert = f"{{ $0.map({wrap}.init) }}" if is_list else f"{wrap}.init"
      if optional:
        return f"{expression}.map({convert})"
      return f"{expression}.map({wrap}.init)" if is_list else f"{wrap}({expression})"

    value = f"self.{prop.strip('`')}"
    if mode == "required":
      return f"try container.encode({dated(value, False)}, forKey: {key})"
    if mode == "optional":
      return f"try container.encodeIfPresent({dated(value, True)}, forKey: {key})"
    return f"if let value = {value} {{ try container.encode({dated('value', True)}, forKey: {key}) }}"

  def is_multipart(self, schema: dict) -> bool:
    def binary(node: dict) -> bool:
      node, _ = self.non_null(node)
      return node.get("format") == "binary" or binary(node.get("items", {})) if node else False

    return any(binary(node) for node in schema.get("properties", {}).values())

  def generate(self) -> str:
    declarations = []
    extensions = []
    for name, schema in self.schemas.items():
      if self.is_multipart(schema):
        continue  # upload bodies, sent as form data rather than JSON
      if "enum" in schema:
        declarations.append(self.enum(name, schema))
      else:
        declaration, extension = self.struct(name, schema)
        declarations.append(declaration)
        extensions.append(extension)

    header = [
      "// Generated by scripts/generate_swift_models.py from services/api/openapi.json.",
      "// Do not edit: change the API, then run `make clients`.",
      "// swiftlint:disable all",
      "",
      "import Foundation",
      "",
      "enum API {",
    ]
    support = [SUPPORT]
    if self.uses_json_value:
      support.append(JSON_VALUE)
    body = "\n\n".join(support + declarations)
    return "\n".join(header) + "\n" + body + "\n}\n\n" + "\n\n".join(extensions) + "\n"


SUPPORT = """    /// A calendar date, sent as YYYY-MM-DD in the device's time zone (the day the user picked).
    struct Day: Encodable {
        let date: Date
        init(_ date: Date) { self.date = date }
        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(API.dayFormatter.string(from: date))
        }
    }

    /// A moment in time, sent as ISO 8601 with fractional seconds.
    struct Instant: Encodable {
        let date: Date
        init(_ date: Date) { self.date = date }
        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(API.instantFormatter.string(from: date))
        }
    }

    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static let instantFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()"""

JSON_VALUE = """    /// Any JSON value, for fields the API leaves open (metadata, error context).
    enum JSONValue: Codable, Hashable {
        case string(String)
        case number(Double)
        case bool(Bool)
        case object([String: JSONValue])
        case array([JSONValue])
        case null

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if container.decodeNil() {
                self = .null
            } else if let value = try? container.decode(Bool.self) {
                self = .bool(value)
            } else if let value = try? container.decode(Double.self) {
                self = .number(value)
            } else if let value = try? container.decode(String.self) {
                self = .string(value)
            } else if let value = try? container.decode([JSONValue].self) {
                self = .array(value)
            } else {
                self = .object(try container.decode([String: JSONValue].self))
            }
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .string(let value): try container.encode(value)
            case .number(let value): try container.encode(value)
            case .bool(let value): try container.encode(value)
            case .object(let value): try container.encode(value)
            case .array(let value): try container.encode(value)
            case .null: try container.encodeNil()
            }
        }
    }"""


def main() -> None:
  spec_path = Path(sys.argv[1]) if len(sys.argv) > 1 else SPEC
  output = Path(sys.argv[2]) if len(sys.argv) > 2 else OUTPUT
  source = Generator(json.loads(spec_path.read_text())).generate()
  output.parent.mkdir(parents=True, exist_ok=True)
  if not output.exists() or output.read_text() != source:
    output.write_text(source)
  print(f"Wrote {output.relative_to(ROOT) if output.is_relative_to(ROOT) else output}")


if __name__ == "__main__":
  main()
