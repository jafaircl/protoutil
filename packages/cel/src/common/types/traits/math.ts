import type { Val } from "../ref/index.js";

/**
 * Adder supports '+' operator overloads.
 */
export interface Adder {
  /**
   * Add returns a combination of the current value and other value.
   */
  add(other: Val): Val;
}

/**
 * Divider supports '/' operator overloads.
 */
export interface Divider {
  /**
   * Divide returns the result of dividing the current value by the input denominator.
   */
  divide(denominator: Val): Val;
}

/**
 * Modder supports '%' operator overloads.
 */
export interface Modder {
  /**
   * Modulo returns the result of taking the modulus of the current value by the denominator.
   */
  modulo(denominator: Val): Val;
}

/**
 * Multiplier supports '*' operator overloads.
 */
export interface Multiplier {
  /**
   * Multiply returns the result of multiplying the current and input value.
   */
  multiply(other: Val): Val;
}

/**
 * Negater supports unary '-' and '!' operator overloads.
 */
export interface Negater {
  /**
   * Negate returns the complement of the current value.
   */
  negate(): Val;
}

/**
 * Subtractor supports binary '-' operator overloads.
 */
export interface Subtractor {
  /**
   * Subtract returns the result of subtracting the input from the current value.
   */
  subtract(subtrahend: Val): Val;
}

/**
 * Sizer supports the size() method.
 */
export interface Sizer {
  /**
   * Size returns the number of elements or length of the value.
   */
  size(): Val;
}
