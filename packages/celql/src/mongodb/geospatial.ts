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
import type { MongoDbTranslation } from "./profile.js";

const profileName = "protoutil.celql.mongodb";
const storage = [
  "The field is a present GeoJSON Point whose coordinates use longitude and latitude order.",
  "The stored position uses WGS 84, which MongoDB assumes for every GeoJSON object.",
];

const library: TranslationLibrary<MongoDbTranslation> = {
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
      capability: relationCapability(geoPointWithinPolygon, [
        ...storage,
        "MongoDB $geoWithin includes a position on the ring, which matches the library's closed containment.",
      ]),
      translate: (context, expression) => context.geoWithin(expression),
    },
    {
      capability: relationCapability(geoPointIntersectsPolygon, storage),
      translate: (context, expression) => context.geoIntersects(expression),
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
          "$centerSphere measures on the library's sphere, so the bound converts to radians on that sphere.",
        ],
      }),
      translate: (context, expression) => context.geoWithinDistance(expression),
    },
  ],
};

/**
 * Returns the MongoDB binding of the geospatial library.
 *
 * The library adds closed polygon containment, polygon intersection, and a
 * great-circle distance bound over a stored GeoJSON `Point`. MongoDB evaluates
 * every emitted operator without a geospatial index, and a `2dsphere` index on
 * the mapped field only improves selection performance.
 */
export function geospatial(): TranslationLibrary<MongoDbTranslation> {
  return library;
}

/** Declares one position-to-polygon relation over a stored GeoJSON position. */
function relationCapability(
  overloadId: string,
  additionalRestrictions: readonly string[],
): OperationCapability {
  return create(OperationCapabilitySchema, {
    overloadId,
    operands: [
      { celType: GeoPointType.typeName(), allowedShapes: [OperandShape.QUERY_FIELD_PATH] },
      { celType: GeoPolygonType.typeName(), allowedShapes: [OperandShape.TRANSLATED_EXPRESSION] },
    ],
    resultType: "bool",
    additionalRestrictions: [...additionalRestrictions],
  });
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
