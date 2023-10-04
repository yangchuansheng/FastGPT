/* bill common  */
import { PRICE_SCALE } from './constants';

/**
 * dataset price / PRICE_SCALE = real price
 */
export const formatPrice = (val = 0, multiple = 1) => {
  return Number(((val / PRICE_SCALE) * multiple).toFixed(10));
};
