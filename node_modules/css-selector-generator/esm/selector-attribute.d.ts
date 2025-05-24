import { CssSelectorGenerated } from "./types.js";
interface AttributeData {
    name: string;
    value: string;
}
export declare const attributeBlacklistMatch: import("./types.js").PatternMatcher;
/**
 * Get simplified attribute selector for an element.
 */
export declare function attributeNodeToSimplifiedSelector({ name, }: AttributeData): CssSelectorGenerated;
/**
 * Get attribute selector for an element.
 */
export declare function attributeNodeToSelector({ name, value, }: AttributeData): CssSelectorGenerated;
/**
 * Checks whether an attribute should be used as a selector.
 */
export declare function isValidAttributeNode({ nodeName, nodeValue }: Node, element: Element): boolean;
/**
 * Get attribute selectors for an element.
 */
export declare function getElementAttributeSelectors(element: Element): CssSelectorGenerated[];
/**
 * Get attribute selectors matching all elements.
 */
export declare function getAttributeSelectors(elements: Element[]): CssSelectorGenerated[];
export {};
