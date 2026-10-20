/**
 * AdderType types provide a '+' operator overload.
 */
export const AdderType = 1 << 0;
/**
 * ComparerType types support ordering comparisons '<', '<=', '>', '>='.
 */
export const ComparerType = 1 << 1;
/**
 * ContainerType types support 'in' operations.
 */
export const ContainerType = 1 << 2;
/**
 * DividerType types support '/' operations.
 */
export const DividerType = 1 << 3;
/**
 * FieldTesterType types support the detection of field value presence.
 */
export const FieldTesterType = 1 << 4;
/**
 * IndexerType types support index access with dynamic values.
 */
export const IndexerType = 1 << 5;
/**
 * IterableType types can be iterated over in comprehensions.
 */
export const IterableType = 1 << 6;
/**
 * IteratorType types support iterator semantics.
 */
export const IteratorType = 1 << 7;
/**
 * MatcherType types support pattern matching via 'matches' method.
 */
export const MatcherType = 1 << 8;
/**
 * ModderType types support modulus operations '%'.
 */
export const ModderType = 1 << 9;
/**
 * MultiplierType types support '*' operations.
 */
export const MultiplierType = 1 << 10;
/**
 * NegatorType types support either negation via '!' or '-'.
 */
export const NegatorType = 1 << 11;
/**
 * ReceiverType types support dynamic dispatch to instance methods.
 */
export const ReceiverType = 1 << 12;
/**
 * SizerType types support the size() method.
 */
export const SizerType = 1 << 13;
/**
 * SubtractorType types support '-' operations.
 */
export const SubtractorType = 1 << 14;
/**
 * FoldableType types support comprehensions v2 macros which iterate over (key, value) pairs.
 */
export const FoldableType = 1 << 15;

/**
 * ListerType supports a set of traits necessary for list operations.
 */
export const ListerType = AdderType | ContainerType | IndexerType | IterableType | SizerType;

/**
 * MapperType supports a set of traits necessary for map operations.
 */
export const MapperType = ContainerType | IndexerType | IterableType | SizerType;
