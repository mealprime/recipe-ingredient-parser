import * as convertIngredientMeasurement from './convertIngredientMeasurement';
import { pluralUnits, units } from './units';
import * as math from 'mathjs';
import * as Qty from 'js-quantities';

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

  /* extraInfo will be any info in parentheses. We'll place it at the end of the ingredient.
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

function scale(
  ingredients: IIngredient[],
  serving: number,
  actualServing: number
): IIngredient[] {
  const ratio = math.floor(actualServing) / serving;
  return ingredients
    .map(item => {
      return Object.assign({}, item, {
        ingredient: item.ingredient,
        quantity: item.quantity
          ? Qty(toNumber(item.quantity) * ratio, normalizeUnit(item.unit)).scalar + ''
          : item.quantity,
        unit: item.unit,
        minQty: item.minQty,
        maxQty: item.maxQty
      });
    });
}

function toNumber(str: string | null): number {
  str = str ?? '0';
  // Take care of this case '1-2' 1 to 2 quantity. just use the first qty for now
  if (str.includes('-')) {
    const parts = str.split('-');
    str = parseFloat(parts?.[0] ?? '0') + '';
  }
  return parseFloat(math.evaluate(str?.trim().replace(' ', '-') + '') + '');
}

function normalizeUnit(unit: string | null): string {
  return unit?.toLowerCase() ?? '';
}

function goodEnoughCombineTwoIngredients(
  existingIngredients: IIngredient,
  ingredient: IIngredient
): IIngredient {
  const existingQty = Qty(
    toNumber(existingIngredients.quantity),
    normalizeUnit(existingIngredients.unit)
  );
  try {
    const qty = Qty(toNumber(ingredient.quantity), normalizeUnit(ingredient.unit));
    const outputQtyUnit = Qty(1, existingQty.units()).gt(Qty(1, qty.units()))
      ? existingQty.units()
      : qty.units();
    const combinedIng = qty.add(existingQty).to(outputQtyUnit);
    const quantity = combinedIng.scalar + '';
    const unit = combinedIng.units();
    return Object.assign({}, existingIngredients, {
      quantity,
      unit,
      maxQty: null,
      minQty: null,
    });
  } catch (e) {
    return Object.assign({}, existingIngredients);
  }
}

/*
 * Goal is to try our best to reduce list of ingredients by there name.
 * unless the same ingredient is measured by different unit kind
 */
function goodEnoughCombine(ingredientArray: IIngredient[]) {
  const combinedIngredients = ingredientArray.reduce((acc, ingredient) => {
    const quantity = toNumber(ingredient.quantity);
    let ingQty;
    try {
      ingQty = Qty(quantity, normalizeUnit(ingredient.unit));
    } catch (e) {
      e.message = `${e.message}. Error while creating qty ${JSON.stringify(ingredient)}`;
      return acc;
    }

    const key = `${ingredient.ingredient}-${ingQty.kind()}`; // when combining different units, remove this from the key and just use the name
    const existingIngredient = acc[key];

    if (existingIngredient) {
      return Object.assign(acc, {
        [key]: goodEnoughCombineTwoIngredients(existingIngredient, ingredient),
      });
    } else {
      return Object.assign(acc, {
        [key]: {
          ...ingredient,
          minQty: null,
          maxQty: null,
        },
      });
    }
  }, {} as { [key: string]: IIngredient });

  return Object.keys(combinedIngredients)
    .reduce((acc, key) => {
      const ingredient = combinedIngredients[key];
      return acc.concat(ingredient);
    }, [] as IIngredient[])
    .sort(compareIngredients);
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

export { goodEnoughCombine, IIngredient, parse, combine, scale };
