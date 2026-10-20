import { create } from "@bufbuild/protobuf";
import {
  LibraryReferenceSchema,
  OperandShape,
  type OperationCapability,
  OperationCapabilitySchema,
  ProfileReferenceSchema,
} from "../gen/protoutil/celql/v1/celql_pb.js";
import {
  GeoPointType,
  GeoPolygonType,
  geoPointIntersectsPolygon,
  geoPointOverload,
  geoPointWithinDistance,
  geoPointWithinPolygon,
  geoPolygonOverload,
  geospatialLibrary,
  geospatialLibraryName,
} from "../geospatial.js";
import type { TranslationLibrary } from "../types.js";
import type { MySqlTranslation } from "./profile.js";

const profileName = "protoutil.celql.mysql";
const storage = [
  "The field is a NOT NULL POINT column that declares SRID 4326.",
  "The emitted geometry uses longitude and latitude order, which the profile states in every call.",
];

const library: TranslationLibrary<MySqlTranslation> = {
  ...geospatialLibrary(),
  reference: create(LibraryReferenceSchema, { name: geospatialLibraryName, majorVersion: 1 }),
  profile: create(ProfileReferenceSchema, { name: profileName, majorVersion: 1 }),
  functions: [
    {
      capability: constructorCapability(geoPointOverload, GeoPointType.typeName(), [
        "double",
        "double",
      ]),
      translate: (context, expression) => {
        throw context.unsupportedExpression(expression);
      },
    },
    {
      capability: constructorCapability(geoPolygonOverload, GeoPolygonType.typeName(), [
        `list(${GeoPointType.typeName()})`,
      ]),
      translate: (context, expression) => {
        throw context.unsupportedExpression(expression);
      },
    },
    {
      capability: create(OperationCapabilitySchema, {
        overloadId: geoPointWithinPolygon,
        operands: [
          { celType: GeoPointType.typeName(), allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
          {
            celType: GeoPolygonType.typeName(),
            allowedShapes: [OperandShape.TRANSLATED_EXPRESSION],
          },
        ],
        resultType: "bool",
        additionalRestrictions: [
          ...storage,
          "Containment is closed, so ST_Intersects preserves the boundary result that ST_Within excludes.",
        ],
      }),
      translate: (context, expression) => context.geoPolygonRelation(expression),
    },
    {
      capability: create(OperationCapabilitySchema, {
        overloadId: geoPointIntersectsPolygon,
        operands: [
          { celType: GeoPointType.typeName(), allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
          {
            celType: GeoPolygonType.typeName(),
            allowedShapes: [OperandShape.TRANSLATED_EXPRESSION],
          },
        ],
        resultType: "bool",
        additionalRestrictions: storage,
      }),
      translate: (context, expression) => context.geoPolygonRelation(expression),
    },
    {
      capability: create(OperationCapabilitySchema, {
        overloadId: geoPointWithinDistance,
        operands: [
          { celType: GeoPointType.typeName(), allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
          { celType: GeoPointType.typeName(), allowedShapes: [OperandShape.TRANSLATED_EXPRESSION] },
          { celType: "double", allowedShapes: [OperandShape.CONSTANT_VALUE] },
        ],
        resultType: "bool",
        additionalRestrictions: [
          ...storage,
          "ST_Distance_Sphere uses the library's sphere radius, not the WGS 84 ellipsoid.",
        ],
      }),
      translate: (context, expression) => context.geoWithinDistance(expression),
    },
  ],
};

/**
 * Returns the MySQL binding of the geospatial library.
 *
 * The library adds closed polygon containment, polygon intersection, and a
 * great-circle distance bound over a `POINT` column that declares SRID 4326.
 */
export function geospatial(): TranslationLibrary<MySqlTranslation> {
  return library;
}

/** Declares a constructor that only a spatial operation may consume. */
function constructorCapability(
  overloadId: string,
  resultType: string,
  celTypes: readonly string[],
): OperationCapability {
  return create(OperationCapabilitySchema, {
    overloadId,
    operands: celTypes.map((celType) => ({
      celType,
      allowedShapes: [OperandShape.CONSTANT_VALUE],
    })),
    resultType,
    additionalRestrictions: [
      "The constructor is query shape for one spatial operation and produces no predicate of its own.",
    ],
  });
}
