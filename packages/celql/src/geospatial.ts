import {
  Bool,
  BoolType,
  type Double,
  DoubleType,
  err,
  func,
  listType,
  memberOverload,
  opaqueType,
  overload,
  type Type,
  TypeType,
  type Val,
} from "@protoutil/cel";
import type { Expr } from "./gen/cel/expr/syntax_pb.js";
import type { CelLibrary } from "./types.js";

/** Stable name of the library that every target binds to its own spatial storage. */
export const geospatialLibraryName = "protoutil.celql.geospatial";

/** Resolved overload that constructs one validated position. */
export const geoPointOverload = "geo_point";

/** Resolved overload that constructs one validated polygon ring. */
export const geoPolygonOverload = "geo_polygon";

/** Resolved overload that tests closed containment of a position in a polygon. */
export const geoPointWithinPolygon = "geo_point_within_polygon";

/** Resolved overload that tests whether a position and a polygon share a position. */
export const geoPointIntersectsPolygon = "geo_point_intersects_polygon";

/** Resolved overload that tests a great-circle distance bound. */
export const geoPointWithinDistance = "geo_point_within_distance";

/**
 * Radius in metres of the sphere that every distance operation uses.
 *
 * The library uses one authalic-scale sphere rather than an ellipsoid, because
 * a spherical model is the only earth model that every bound target computes
 * identically.
 */
export const earthRadiusMeters = 6_378_100;

/**
 * Opaque CEL type for one WGS 84 position, in longitude and latitude degrees.
 *
 * A query field of this type holds one stored position. The same type is the
 * result of `geoPoint`, so a constant position and a stored position share one
 * comparison domain. Each profile documents the storage its target requires.
 */
export const GeoPointType = opaqueType("protoutil.celql.GeoPoint");

/**
 * Opaque CEL type for one closed, convex, counterclockwise WGS 84 polygon ring.
 *
 * The ring is a constant query shape. No target stores this type.
 */
export const GeoPolygonType = opaqueType("protoutil.celql.GeoPolygon");

/** Maximum number of ring positions that one polygon may contain. */
const maximumRingPositions = 64;

/**
 * Unit-sphere distance within which a position counts as on a ring edge.
 *
 * The value is about six micrometres on the earth's surface. It keeps a stored
 * ring vertex on the ring under floating-point rounding. A caller MUST NOT rely
 * on a target and this evaluation agreeing about a position that lies closer to
 * the ring than this tolerance without lying on it.
 */
const boundaryTolerance = 1e-12;

/**
 * Degrees added to each side of a distance envelope.
 *
 * The margin is about 11 centimetres of latitude. It keeps rounding in the
 * envelope from excluding a position that the exact distance test accepts.
 */
const envelopeMargin = 1e-6;

/** CEL runtime value for one WGS 84 position. */
export class GeoPointValue implements Val {
  /** Longitude in degrees, from -180 through 180. */
  public readonly longitude: number;

  /** Latitude in degrees, from -90 through 90. */
  public readonly latitude: number;

  /**
   * Creates one validated position.
   *
   * Throws when a coordinate is outside its WGS 84 range or is not finite.
   *
   * @param longitude Longitude in degrees. The first coordinate, as in GeoJSON.
   * @param latitude Latitude in degrees. The second coordinate, as in GeoJSON.
   */
  public constructor(longitude: number, latitude: number) {
    if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError("a longitude must be a finite value from -180 through 180");
    }
    if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
      throw new RangeError("a latitude must be a finite value from -90 through 90");
    }
    this.longitude = longitude;
    this.latitude = latitude;
  }

  /** Returns this value for its own native type and rejects other conversions. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === GeoPointValue || typeDesc === undefined) return this;
    throw new Error(`type conversion from '${GeoPointType.typeName()}' is not supported`);
  }

  /** Converts only to this opaque CEL type or CEL's type value. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === GeoPointType) return this;
    if (typeValue === TypeType) return GeoPointType;
    return err(
      "type conversion error from '%s' to '%s'",
      GeoPointType.typeName(),
      typeValue.typeName(),
    );
  }

  /** Compares both coordinates exactly. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof GeoPointValue &&
        this.longitude === other.longitude &&
        this.latitude === other.latitude,
    );
  }

  /** Returns the opaque CEL type of this position. */
  public type(): Type {
    return GeoPointType;
  }

  /** Returns the GeoJSON coordinate order of this position. */
  public value(): unknown {
    return [this.longitude, this.latitude];
  }

  /** Returns the great-circle distance in metres to another position. */
  public distanceMeters(other: GeoPointValue): number {
    const latitude = radians(other.latitude - this.latitude);
    const longitude = radians(other.longitude - this.longitude);
    const haversine =
      Math.sin(latitude / 2) ** 2 +
      Math.cos(radians(this.latitude)) *
        Math.cos(radians(other.latitude)) *
        Math.sin(longitude / 2) ** 2;
    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
  }
}

/**
 * CEL runtime value for one closed, convex, counterclockwise polygon ring.
 *
 * Ring edges are geodesics, which is the edge interpretation that every bound
 * target applies to a WGS 84 polygon. The constructor rejects a ring that is
 * open, degenerate, clockwise, or not convex, because containment in such a
 * ring is target-specific.
 */
export class GeoPolygonValue implements Val {
  /** Ring positions in counterclockwise order, ending with the first position. */
  public readonly ring: readonly GeoPointValue[];

  /**
   * Creates one validated ring.
   *
   * Throws when the ring is not closed, holds fewer than four positions, holds
   * more positions than the library's bound, repeats a position consecutively,
   * or is not a convex counterclockwise ring.
   *
   * @param ring Ring positions, ending with a repetition of the first position.
   */
  public constructor(ring: readonly GeoPointValue[]) {
    if (ring.length < 4 || ring.length > maximumRingPositions) {
      throw new RangeError(
        `a polygon ring requires 4 through ${maximumRingPositions} positions, including its repeated first position`,
      );
    }
    const first = ring[0]!;
    const last = ring.at(-1)!;
    if (first.longitude !== last.longitude || first.latitude !== last.latitude) {
      throw new RangeError("a polygon ring must end with its first position");
    }
    const positions = ring.slice(0, -1);
    for (let index = 0; index < positions.length; index += 1) {
      const next = positions[(index + 1) % positions.length]!;
      const current = positions[index]!;
      if (current.longitude === next.longitude && current.latitude === next.latitude) {
        throw new RangeError("a polygon ring must not repeat a position consecutively");
      }
    }
    if (!isConvexCounterclockwise(positions)) {
      throw new RangeError("a polygon ring must be convex and counterclockwise");
    }
    this.ring = [...ring];
  }

  /** Returns this value for its own native type and rejects other conversions. */
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === GeoPolygonValue || typeDesc === undefined) return this;
    throw new Error(`type conversion from '${GeoPolygonType.typeName()}' is not supported`);
  }

  /** Converts only to this opaque CEL type or CEL's type value. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === GeoPolygonType) return this;
    if (typeValue === TypeType) return GeoPolygonType;
    return err(
      "type conversion error from '%s' to '%s'",
      GeoPolygonType.typeName(),
      typeValue.typeName(),
    );
  }

  /** Compares ring positions in order. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof GeoPolygonValue &&
        this.ring.length === other.ring.length &&
        this.ring.every((position, index) => position.equal(other.ring[index]!).value() === true),
    );
  }

  /** Returns the opaque CEL type of this ring. */
  public type(): Type {
    return GeoPolygonType;
  }

  /** Returns the GeoJSON coordinates of this ring. */
  public value(): unknown {
    return this.ring.map((position) => position.value());
  }

  /**
   * Reports whether a position lies inside this ring or on its boundary.
   *
   * Containment is closed, because a position on the ring is the only boundary
   * result that every bound target reproduces. A position whose distance from
   * an edge plane is within the library's tolerance counts as on the ring, so
   * that a stored ring vertex does not depend on rounding.
   */
  public contains(point: GeoPointValue): boolean {
    const positions = this.ring.slice(0, -1).map(unitVector);
    const candidate = unitVector(point);
    return positions.every((position, index) => {
      const next = positions[(index + 1) % positions.length]!;
      return dot(cross(position, next), candidate) >= -boundaryTolerance;
    });
  }
}

/**
 * Returns the CEL declarations and evaluation bindings of the geospatial library.
 *
 * A profile binding adds the target translation that preserves these semantics.
 * Callers that only evaluate CEL, such as a differential test oracle, select
 * this library directly.
 */
export function geospatialLibrary(): CelLibrary {
  return celLibrary;
}

const celLibrary: CelLibrary = {
  libraryName: geospatialLibraryName,
  libraryVersion: 1,
  programOptions: {},
  compileOptions: {
    types: [GeoPointType, GeoPolygonType],
    functions: [
      func("geoPoint", {
        overloads: [
          overload(geoPointOverload, [DoubleType, DoubleType], GeoPointType, {
            binaryBinding: (longitude, latitude) =>
              geoPoint((longitude as Double).value(), (latitude as Double).value()),
          }),
        ],
      }),
      func("geoPolygon", {
        overloads: [
          overload(geoPolygonOverload, [listType(GeoPointType)], GeoPolygonType, {
            unaryBinding: (ring) => geoPolygon(ring),
          }),
        ],
      }),
      func("geoWithin", {
        overloads: [
          memberOverload(geoPointWithinPolygon, [GeoPointType, GeoPolygonType], BoolType, {
            binaryBinding: (point, polygon) =>
              new Bool((polygon as GeoPolygonValue).contains(point as GeoPointValue)),
          }),
        ],
      }),
      func("geoIntersects", {
        overloads: [
          memberOverload(geoPointIntersectsPolygon, [GeoPointType, GeoPolygonType], BoolType, {
            binaryBinding: (point, polygon) =>
              new Bool((polygon as GeoPolygonValue).contains(point as GeoPointValue)),
          }),
        ],
      }),
      func("geoWithinDistance", {
        overloads: [
          memberOverload(
            geoPointWithinDistance,
            [GeoPointType, GeoPointType, DoubleType],
            BoolType,
            {
              functionBinding: (...args) => {
                const [point, center, meters] = args as [GeoPointValue, GeoPointValue, Double];
                if (!isDistanceBound(meters.value())) {
                  return err("a distance bound must be a finite value of at least zero metres");
                }
                return new Bool(point.distanceMeters(center) <= meters.value());
              },
            },
          ),
        ],
      }),
    ],
  },
};

/** Reports whether a metre bound stays inside the library's distance domain. */
export function isDistanceBound(meters: number): boolean {
  return isFiniteNumber(meters) && meters >= 0;
}

/**
 * Reads the position that a `geoPoint` constructor call builds.
 *
 * Returns `undefined` when the expression is not that constructor, and
 * `"invalid"` when it is the constructor with a position outside its range.
 *
 * @param expression Candidate constructor call.
 * @param overloadOf Resolves the checked overload of one reachable call.
 */
export function geoPointArgument(
  expression: Expr,
  overloadOf: (expression: Expr) => string,
): GeoPointValue | "invalid" | undefined {
  const args = constructorArguments(expression, geoPointOverload, overloadOf);
  if (args === undefined || args.length !== 2) return undefined;
  const longitude = doubleConstant(args[0]!, overloadOf);
  const latitude = doubleConstant(args[1]!, overloadOf);
  if (longitude === undefined || latitude === undefined) return "invalid";
  try {
    return new GeoPointValue(longitude, latitude);
  } catch {
    return "invalid";
  }
}

/**
 * Reads the ring that a `geoPolygon` constructor call builds.
 *
 * Returns `undefined` when the expression is not that constructor, and
 * `"invalid"` when it is the constructor with a ring outside the library's
 * documented domain.
 *
 * @param expression Candidate constructor call.
 * @param overloadOf Resolves the checked overload of one reachable call.
 */
export function geoPolygonArgument(
  expression: Expr,
  overloadOf: (expression: Expr) => string,
): GeoPolygonValue | "invalid" | undefined {
  const args = constructorArguments(expression, geoPolygonOverload, overloadOf);
  if (args === undefined || args.length !== 1) return undefined;
  const ring = args[0]!;
  if (ring.exprKind.case !== "listExpr") return "invalid";
  const positions: GeoPointValue[] = [];
  for (const element of ring.exprKind.value.elements) {
    const position = geoPointArgument(element, overloadOf);
    if (position === undefined || position === "invalid") return "invalid";
    positions.push(position);
  }
  try {
    return new GeoPolygonValue(positions);
  } catch {
    return "invalid";
  }
}

/** Returns the arguments of one constructor call, or `undefined` for another expression. */
function constructorArguments(
  expression: Expr,
  overloadId: string,
  overloadOf: (expression: Expr) => string,
): readonly Expr[] | undefined {
  if (expression.exprKind.case !== "callExpr" || expression.exprKind.value.target !== undefined) {
    return undefined;
  }
  try {
    if (overloadOf(expression) !== overloadId) return undefined;
  } catch {
    return undefined;
  }
  return expression.exprKind.value.args;
}

/** Reads a double constant, including the negation that CEL builds for a signed literal. */
function doubleConstant(
  expression: Expr,
  overloadOf: (expression: Expr) => string,
): number | undefined {
  if (expression.exprKind.case === "constExpr") {
    const constant = expression.exprKind.value.constantKind;
    return constant.case === "doubleValue" ? constant.value : undefined;
  }
  if (expression.exprKind.case !== "callExpr" || expression.exprKind.value.args.length !== 1) {
    return undefined;
  }
  let overloadId: string;
  try {
    overloadId = overloadOf(expression);
  } catch {
    return undefined;
  }
  if (overloadId !== "negate_double") return undefined;
  const operand = doubleConstant(expression.exprKind.value.args[0]!, overloadOf);
  return operand === undefined ? undefined : -operand;
}

/** Encodes one position as well-known text in longitude and latitude order. */
export function geoPointText(point: GeoPointValue): string {
  return `POINT(${coordinateText(point)})`;
}

/** Encodes one ring as well-known text in longitude and latitude order. */
export function geoPolygonText(polygon: GeoPolygonValue): string {
  return `POLYGON((${polygon.ring.map(coordinateText).join(", ")}))`;
}

/**
 * Encodes the smallest longitude and latitude rectangle that holds a distance bound.
 *
 * The rectangle is a superset of the positions within `meters` of `center`, so
 * a target can apply it as an index-usable filter before the exact distance
 * test without changing the selected records.
 *
 * Returns `undefined` when the bound crosses the antimeridian or reaches a
 * pole. One rectangle cannot describe those regions, and a rectangle that
 * spans every longitude does not select the positions inside it on every
 * target, so a caller applies the exact distance test alone there.
 *
 * @param center Center of the distance bound.
 * @param meters Distance bound in metres, on the library's sphere.
 */
export function geoDistanceEnvelopeText(center: GeoPointValue, meters: number): string | undefined {
  const angle = degrees(meters / earthRadiusMeters) + envelopeMargin;
  const south = center.latitude - angle;
  const north = center.latitude + angle;
  const longitudeSpan = longitudeHalfSpan(center.latitude, angle);
  const west = center.longitude - longitudeSpan;
  const east = center.longitude + longitudeSpan;
  if (longitudeSpan >= 180 || west <= -180 || east >= 180 || south <= -90 || north >= 90) {
    return undefined;
  }
  const ring = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return `POLYGON((${ring.map(([longitude, latitude]) => `${longitude} ${latitude}`).join(", ")}))`;
}

/** Returns the half-width in longitude degrees of a distance bound at one latitude. */
function longitudeHalfSpan(latitude: number, angle: number): number {
  if (latitude + angle >= 90 || latitude - angle <= -90) return 180;
  const cosine = Math.cos(radians(latitude));
  if (cosine <= 0) return 180;
  const ratio = Math.sin(radians(angle)) / cosine;
  if (ratio >= 1) return 180;
  return degrees(Math.asin(ratio)) + envelopeMargin;
}

function degrees(value: number): number {
  return (value * 180) / Math.PI;
}

function coordinateText(point: GeoPointValue): string {
  return `${point.longitude} ${point.latitude}`;
}

/** Creates a position value, or a CEL error when a coordinate is outside its range. */
function geoPoint(longitude: number, latitude: number): Val {
  try {
    return new GeoPointValue(longitude, latitude);
  } catch (error) {
    return err((error as Error).message);
  }
}

/** Creates a ring value, or a CEL error when the ring is outside the library's domain. */
function geoPolygon(ring: Val): Val {
  const positions = ringPositions(ring);
  if (positions === undefined) return err("a polygon ring requires positions");
  try {
    return new GeoPolygonValue(positions);
  } catch (error) {
    return err((error as Error).message);
  }
}

/** Reads ring positions from a CEL list of positions. */
function ringPositions(ring: Val): GeoPointValue[] | undefined {
  const native = ring.value();
  if (!Array.isArray(native)) return undefined;
  const positions: GeoPointValue[] = [];
  for (const item of native) {
    if (item instanceof GeoPointValue) {
      positions.push(item);
      continue;
    }
    if (Array.isArray(item) && item.length === 2) {
      positions.push(new GeoPointValue(Number(item[0]), Number(item[1])));
      continue;
    }
    return undefined;
  }
  return positions;
}

/**
 * Reports whether ring positions form a convex counterclockwise spherical ring.
 *
 * Every position must lie on the inner side of every edge. That test also
 * proves the ring stays inside one hemisphere, so containment has one
 * unambiguous interior.
 */
function isConvexCounterclockwise(positions: readonly GeoPointValue[]): boolean {
  const vectors = positions.map(unitVector);
  return vectors.every((vector, index) => {
    const next = vectors[(index + 1) % vectors.length]!;
    const normal = cross(vector, next);
    return vectors.every((candidate, candidateIndex) => {
      if (candidateIndex === index || candidateIndex === (index + 1) % vectors.length) return true;
      return dot(normal, candidate) > 0;
    });
  });
}

type Vector = readonly [number, number, number];

function unitVector(point: GeoPointValue): Vector {
  const longitude = radians(point.longitude);
  const latitude = radians(point.latitude);
  return [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function cross(left: Vector, right: Vector): Vector {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: Vector, right: Vector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}
