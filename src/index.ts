import * as convertIngredientMeasurement from './convertIngredientMeasurement';
import { units, pluralUnits } from './units';
import { repeatingFractions } from './repeatingFractions';
import * as Natural from 'natural';
import * as math from 'mathjs';
import * as Qty from 'js-quantities';

const nounInflector = new Natural.NounInflector();

interface IIngredient {
  ingredient: string;
  quantity: string | null;
  unit: string | null;
  minQty: string | null;
  maxQty: string | null;
}

function getUnit(input: string) {
  if (units[input] || pluralUnits[input]) {
    return [input];
  }
  for (const unit of Object.keys(units)) {
    for (const shorthand of units[unit]) {
      if (input === shorthand) {
        return [unit, input];
      }
    }
  }
  for (const pluralUnit of Object.keys(pluralUnits)) {
    if (input === pluralUnits[pluralUnit]) {
      return [pluralUnit, input];
    }
  }
  return [];
}

function parse(recipeString: string) {
  const ingredientLine = recipeString.trim(); // removes leading and trailing whitespace

  /* restOfIngredient represents rest of ingredient line.
  For example: "1 pinch salt" --> quantity: 1, restOfIngredient: pinch salt */
  let [
    quantity,
    restOfIngredient,
  ] = convertIngredientMeasurement.findQuantityAndConvertIfUnicode(
    ingredientLine
  ) as string[];

  quantity = convertIngredientMeasurement.convertFromFraction(quantity);

  /* extraInfo will be any info in parantheses. We'll place it at the end of the ingredient.
  For example: "sugar (or other sweetener)" --> extraInfo: "(or other sweetener)" */
  let extraInfo;
  if (
    convertIngredientMeasurement.getFirstMatch(restOfIngredient, /\(([^\)]+)\)/)
  ) {
    extraInfo = convertIngredientMeasurement.getFirstMatch(
      restOfIngredient,
      /\(([^\)]+)\)/
    );
    restOfIngredient = restOfIngredient.replace(extraInfo, '').trim();
  }

  // grab unit and turn it into non-plural version, for ex: "Tablespoons" OR "Tsbp." --> "tablespoon"
  const [unit, originalUnit] = getUnit(
    restOfIngredient.split(' ')[0]
  ) as string[];
  // remove unit from the ingredient if one was found and trim leading and trailing whitespace
  const ingredient = !!originalUnit
    ? restOfIngredient.replace(originalUnit, '').trim()
    : restOfIngredient.replace(unit, '').trim();

  let minQty = quantity; // default to quantity
  let maxQty = quantity; // default to quantity

  // if quantity is non-nil and is a range, for ex: "1-2", we want to get minQty and maxQty
  if (quantity && quantity.includes('-')) {
    [minQty, maxQty] = quantity.split('-');
  }
  return {
    quantity,
    unit: !!unit ? unit : null,
    ingredient,
    extraInfo: extraInfo ?? '',
    minQty,
    maxQty,
  };
}

function combine(ingredientArray: IIngredient[]) {
  const combinedIngredients = ingredientArray.reduce((acc, ingredient) => {
    const key = ingredient.ingredient + ingredient.unit; // when combining different units, remove this from the key and just use the name
    const existingIngredient = acc[key];

    if (existingIngredient) {
      return Object.assign(acc, {
        [key]: combineTwoIngredients(existingIngredient, ingredient),
      });
    } else {
      return Object.assign(acc, { [key]: ingredient });
    }
  }, {} as { [key: string]: IIngredient });

  return Object.keys(combinedIngredients)
    .reduce((acc, key) => {
      const ingredient = combinedIngredients[key];
      return acc.concat(ingredient);
    }, [] as IIngredient[])
    .sort(compareIngredients);
}

/*
 * Ingredients is grouped by name instead of name and unit
 */
function normalizedCombine(ingredientArray: IIngredient[]) {
  const combinedIngredients: { [ingredient: string]: IIngredient } = {};
  for (const ingredient of ingredientArray) {
    if (!ingredient.ingredient || !ingredient.quantity) {
      continue;
    }
    // evaluate number, fration to decimal since js-quantities only work with decimal
    const quantity = math.evaluate(ingredient.quantity.trim().replace(' ', '-')) + '';
    const unit = ingredient.unit?.toLocaleLowerCase() + '';
    const normalizedIngredient = Qty(parseFloat(quantity), unit);
    const unitType = normalizedIngredient.kind();
    if (!['volume', 'mass'].includes(unitType)) {
      throw new Error('Unexpected ingredient unit type');
    }

    const key = ingredient.ingredient;
    if (key in combinedIngredients) {
      const existing = Qty(
        parseFloat(combinedIngredients[key].quantity + ''),
        combinedIngredients[key].unit + ''
      );
      // We pick the larger unit. e.g teaspoon vs cup --> cup
      let chosenUnit;
      if (Qty(1, existing.units()).gt(normalizedIngredient)) {
        chosenUnit = existing.units();
      } else {
        chosenUnit = normalizedIngredient.units();
      }

      const collapsedQty = normalizedIngredient.add(existing).to(chosenUnit);
      combinedIngredients[key] = {
        ...combinedIngredients[key],
        quantity: collapsedQty.toFloat() + '',
        unit: collapsedQty.units(),
      };
    } else {
      combinedIngredients[key] = {
        ...ingredient,
        quantity,
        unit,
      };
    }
  }
  return combinedIngredients;
}

function prettyPrintingPress(ingredient: IIngredient): string {
  let quantity = '';
  let unit = ingredient.unit;
  if (ingredient.quantity) {
    const [whole, remainder] = ingredient.quantity.split('.');
    if (+whole !== 0 && typeof whole !== 'undefined') {
      quantity = whole;
    }
    if (+remainder !== 0 && typeof remainder !== 'undefined') {
      let fractional;
      if (repeatingFractions[remainder]) {
        fractional = repeatingFractions[remainder];
      } else {
        const fraction = '0.' + remainder;
        const len = fraction.length - 2;
        let denominator = Math.pow(10, len);
        let numerator = +fraction * denominator;

        const divisor = gcd(numerator, denominator);

        numerator /= divisor;
        denominator /= divisor;
        fractional = Math.floor(numerator) + '/' + Math.floor(denominator);
      }

      quantity += quantity ? ' ' + fractional : fractional;
    }
    if (
      ((+whole !== 0 && typeof remainder !== 'undefined') || +whole > 1) &&
      unit
    ) {
      unit = nounInflector.pluralize(unit);
    }
  } else {
    return ingredient.ingredient;
  }

  return `${quantity}${unit ? ' ' + unit : ''} ${ingredient.ingredient}`;
}

function gcd(a: number, b: number): number {
  if (b < 0.0000001) {
    return a;
  }

  return gcd(b, Math.floor(a % b));
}

// TODO: Maybe change this to existingIngredients: IIngredient | IIngredient[]
function combineTwoIngredients(
  existingIngredients: IIngredient,
  ingredient: IIngredient
): IIngredient {
  const quantity =
    existingIngredients.quantity && ingredient.quantity
      ? (
          Number(existingIngredients.quantity) + Number(ingredient.quantity)
        ).toString()
      : null;
  const minQty =
    existingIngredients.minQty && ingredient.minQty
      ? (
          Number(existingIngredients.minQty) + Number(ingredient.minQty)
        ).toString()
      : null;
  const maxQty =
    existingIngredients.maxQty && ingredient.maxQty
      ? (
          Number(existingIngredients.maxQty) + Number(ingredient.maxQty)
        ).toString()
      : null;
  return Object.assign({}, existingIngredients, { quantity, minQty, maxQty });
}

function compareIngredients(a: IIngredient, b: IIngredient) {
  if (a.ingredient === b.ingredient) {
    return 0;
  }
  return a.ingredient < b.ingredient ? -1 : 1;
}

export { prettyPrintingPress, normalizedCombine, IIngredient, parse, combine };
