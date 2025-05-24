import { sanitizeSelectorNeedle, SELECTOR_TYPE_GETTERS, } from "./utilities-selectors.js";
import { getIntersection } from "./utilities-data.js";
/**
 * Returns memoized data for element, creates new record in memo if necessary.
 */
function getElementData(element, memo = new Map()) {
    if (!memo.get(element)) {
        memo.set(element, new Map());
    }
    return memo.get(element);
}
/**
 * Returns selector data of given type for element. Generates selector data if necessary.
 */
function getSelectorData(element, selectorType, memo = new Map()) {
    const elementData = getElementData(element, memo);
    if (!elementData.get(selectorType)) {
        elementData.set(selectorType, getSelectors(element, selectorType));
    }
    return elementData.get(selectorType);
}
/**
 * Returns selector data of given type for element.
 */
function getSelectors(element, selectorType) {
    return SELECTOR_TYPE_GETTERS[selectorType]([element]);
}
/**
 * Creates interface for getting CSS selectors by type for an element. Results are remembered for use in later calls.
 */
export function createMemo(memo = new Map()) {
    return function (needle, selectors) {
        const result = {};
        const sanitizedNeedle = sanitizeSelectorNeedle(needle);
        selectors.forEach((selectorType) => {
            result[selectorType] = getIntersection(sanitizedNeedle.map((element) => getSelectorData(element, selectorType, memo)));
        });
        return result;
    };
}
//# sourceMappingURL=memo.js.map