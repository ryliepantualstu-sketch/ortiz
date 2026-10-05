// Price of a product for a given lens option, falling back to the base price
function getPriceByLensOption(product, lensOption = 'regular-lens') {
  if (!product) return 0;

  if (lensOption === 'frame-only' && product.frame_only_price) {
    return product.frame_only_price;
  } else if (lensOption === 'photochromic' && product.photochromic_price) {
    return product.photochromic_price;
  } else if (lensOption === 'regular-lens' && product.regular_lens_price) {
    return product.regular_lens_price;
  }

  return product.price;
}

module.exports = { getPriceByLensOption };
