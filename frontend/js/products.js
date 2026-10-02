import { api, getToken, requireAuth, setButtonLoading, showToast } from "./api.js";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80";
const CATEGORY_IMAGES = {
  Electronics: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80",
  Fashion: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
  Home: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",
  Beauty: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80",
  Sports: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80",
};

let availableDiscounts = [];
let wishlistIds = new Set();
let categoryNames = new Map();
let productNames = new Map();

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

function imageUrl(product) {
  return product.image_url || FALLBACK_IMAGE;
}

function matchingOffer(product) {
  return availableDiscounts.find((discount) =>
    (discount.product_id && discount.product_id === product.id)
    || (discount.category_id && discount.category_id === product.category_id));
}

function discountScope(discount) {
  if (discount.product_id) return `Applies to ${productNames.get(discount.product_id) || "a selected product"}`;
  if (discount.category_id) return `Applies to ${categoryNames.get(discount.category_id) || "a selected category"}`;
  return "Applies to qualifying cart items";
}

function cardMarkup(product, options = {}) {
  const saved = options.saved === true || wishlistIds.has(product.id);
  const offer = matchingOffer(product);
  const offerLabel = offer
    ? `${offer.discount_type === "percentage" ? `${offer.discount_value}% off` : `${money(offer.discount_value)} off`} · ${offer.title}`
    : "";
  const discountLabel = product.suggested_discount
    ? `${product.suggested_discount.discount_value}% suggested for you`
    : options.discountText || offerLabel;
  return `<article class="product-card" data-product-card="${product.id}">
    <div class="product-card__image-wrap"><img class="product-card__image" src="${escapeHtml(imageUrl(product))}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'">
      ${discountLabel ? `<span class="product-card__tag">${escapeHtml(discountLabel)}</span>` : ""}
      <button class="product-card__wish ${saved ? "is-saved" : ""}" type="button" data-wishlist="${product.id}" aria-label="${saved ? "Remove from" : "Add to"} wishlist" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
    </div><div class="product-card__body"><div class="product-card__meta"><span>${escapeHtml(product.category?.name || product.category_name || "A good find")}</span><span>${Number(product.stock) > 0 ? `${product.stock} in stock` : "Out of stock"}</span></div>
      <p class="product-card__brand">${escapeHtml(product.brand || "Dealora find")}</p><h3><button type="button" class="product-card__title" data-view-product="${product.id}">${escapeHtml(product.name)}</button></h3>
      <div class="product-card__bottom"><strong>${money(product.price)}</strong><div class="product-card__actions"><button class="product-action" type="button" data-view-product="${product.id}" aria-label="View ${escapeHtml(product.name)}">Details</button><button class="product-action product-action--add" type="button" data-add-cart="${product.id}" ${Number(product.stock) <= 0 ? "disabled" : ""}>Add <span aria-hidden="true">+</span></button></div></div>
    </div></article>`;
}

async function refreshCartBadge() {
  if (!getToken()) return;
  try {
    const { cart } = await api.cart();
    const badge = document.querySelector("[data-cart-count]");
    if (badge) {
      badge.textContent = cart.item_count > 99 ? "99+" : String(cart.item_count);
      badge.hidden = cart.item_count === 0;
    }
  } catch (error) {
    if (error.status !== 401) console.warn(error.message);
  }
}

async function loadWishlistState() {
  wishlistIds = new Set();
  if (!getToken()) return;
  try {
    const { wishlist } = await api.wishlist();
    wishlistIds = new Set(wishlist.map((product) => product.id));
  } catch (error) {
    if (error.status !== 401) console.warn(error.message);
  }
}

function removeWishlistCard(button) {
  const card = button.closest("[data-product-card]");
  const grid = document.querySelector("#product-grid");
  card?.remove();
  const remaining = grid?.querySelectorAll("[data-product-card]").length || 0;
  const summary = document.querySelector("#results-summary");
  if (summary) summary.textContent = `${remaining} saved ${remaining === 1 ? "find" : "finds"}`;
  if (grid && remaining === 0) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-state__symbol">✳</span><h2>Your wishlist is ready.</h2><p>Tap the heart on a product to keep it close.</p><a class="button button--dark" href="products.html">Explore products <span>↗</span></a></div>`;
  }
}

async function handleProductAction(event) {
  const addButton = event.target.closest("[data-add-cart]");
  const wishlistButton = event.target.closest("[data-wishlist]");
  const detailButton = event.target.closest("[data-view-product]");

  if (addButton) {
    if (!requireAuth()) return;
    setButtonLoading(addButton, true, "Adding");
    try {
      await api.addToCart(addButton.dataset.addCart);
      await refreshCartBadge();
      showToast("Added to your cart.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setButtonLoading(addButton, false);
    }
  }

  if (wishlistButton) {
    if (!requireAuth()) return;
    const wasSaved = wishlistButton.getAttribute("aria-pressed") === "true";
    setButtonLoading(wishlistButton, true, "Saving");
    try {
      if (wasSaved) {
        await api.removeFromWishlist(wishlistButton.dataset.wishlist);
        wishlistIds.delete(Number(wishlistButton.dataset.wishlist));
        wishlistButton.setAttribute("aria-pressed", "false");
        wishlistButton.classList.remove("is-saved");
        wishlistButton.setAttribute("aria-label", "Add to wishlist");
        if (new URLSearchParams(window.location.search).get("view") === "wishlist") removeWishlistCard(wishlistButton);
        showToast("Removed from your wishlist.", "success");
      } else {
        await api.addToWishlist(wishlistButton.dataset.wishlist);
        wishlistIds.add(Number(wishlistButton.dataset.wishlist));
        wishlistButton.setAttribute("aria-pressed", "true");
        wishlistButton.classList.add("is-saved");
        wishlistButton.setAttribute("aria-label", "Remove from wishlist");
        showToast("Saved to your wishlist.", "success");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setButtonLoading(wishlistButton, false);
      const saved = wishlistButton.getAttribute("aria-pressed") === "true";
      wishlistButton.textContent = wishlistButton.classList.contains("product-card__wish")
        ? (saved ? "♥" : "♡")
        : (saved ? "Saved to wishlist ♥" : "Save to wishlist ♡");
    }
  }

  if (detailButton) await showProductDetail(detailButton.dataset.viewProduct);
}

async function showProductDetail(productId) {
  const detail = document.querySelector("#product-detail");
  if (!detail) {
    window.location.assign(`products.html?product=${encodeURIComponent(productId)}`);
    return;
  }
  detail.hidden = false;
  detail.innerHTML = `<div class="loading-state">Opening product...</div>`;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const { product } = await api.product(productId);
    if (getToken()) {
      try { await api.recordActivity(product.id, "view"); }
      catch (error) { if (error.status !== 401) console.warn(error.message); }
    }
    const saved = wishlistIds.has(product.id);
    const offer = matchingOffer(product);
    detail.innerHTML = `<button type="button" class="product-detail__close" data-close-detail aria-label="Close product details">×</button><img src="${escapeHtml(imageUrl(product))}" alt="${escapeHtml(product.name)}" onerror="this.src='${FALLBACK_IMAGE}'"><div class="product-detail__copy"><p class="eyebrow">${escapeHtml(product.category?.name || "Dealora edit")}</p><p class="product-card__brand">${escapeHtml(product.brand || "Dealora find")}</p><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.description)}</p>${offer ? `<p class="offer-note">${escapeHtml(offer.title)}: ${offer.discount_type === "percentage" ? `${offer.discount_value}% off` : `${money(offer.discount_value)} off`} · code ${escapeHtml(offer.coupon_code || "available at checkout")}</p>` : ""}<strong class="product-detail__price">${money(product.price)}</strong><span class="stock-line">${product.stock} available</span><div class="product-detail__actions"><button class="button button--dark" type="button" data-add-cart="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>Add to cart</button><button class="button button--outline" type="button" data-wishlist="${product.id}" aria-pressed="${saved}">${saved ? "Saved to wishlist ♥" : "Save to wishlist ♡"}</button></div></div>`;
  } catch (error) {
    detail.innerHTML = `<div class="empty-state"><h2>Couldn't open that find.</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function initHomeSearch() {
  document.querySelector("#home-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new URLSearchParams({ search: event.currentTarget.elements.search.value.trim() });
    window.location.assign(`products.html?${query.toString()}`);
  });
}

async function loadHome() {
  const categoryGrid = document.querySelector("#category-grid");
  const featuredGrid = document.querySelector("#featured-product-grid");
  const discountGrid = document.querySelector("#discount-grid");
  const recommendationGrid = document.querySelector("#recommendation-grid");
  if (!categoryGrid && !featuredGrid && !discountGrid && !recommendationGrid) return;
  initHomeSearch();
  await loadWishlistState();

  if (discountGrid) {
    try {
      const { discounts } = await api.discounts();
      availableDiscounts = discounts;
    } catch (error) { console.warn(error.message); }
  }
  if (categoryGrid) {
    try {
      const { categories } = await api.categories();
      categoryNames = new Map(categories.map((category) => [category.id, category.name]));
      categoryGrid.innerHTML = categories.map((category, index) => `<a class="category-tile category-tile--${index + 1}" href="products.html?category=${encodeURIComponent(category.name)}"><img src="${CATEGORY_IMAGES[category.name] || FALLBACK_IMAGE}" alt="${escapeHtml(category.name)} collection" loading="lazy"><span class="category-tile__shade"></span><span class="category-tile__copy"><small>${String(index + 1).padStart(2, "0")} / EXPLORE</small><strong>${escapeHtml(category.name)}</strong><span>Discover the edit <b>↗</b></span></span></a>`).join("") || `<p class="empty-copy">New categories are on their way.</p>`;
    } catch (error) { categoryGrid.innerHTML = `<p class="inline-error">${escapeHtml(error.message)}</p>`; }
  }
  if (featuredGrid) {
    try {
      const { products } = await api.products("sort=popular");
      productNames = new Map(products.map((product) => [product.id, product.name]));
      featuredGrid.innerHTML = products.slice(0, 4).map((product) => cardMarkup(product)).join("") || `<div class="empty-state"><h3>No products just yet</h3><p>Check back soon for new finds.</p></div>`;
    } catch (error) { featuredGrid.innerHTML = `<p class="inline-error">${escapeHtml(error.message)}</p>`; }
  }
  if (discountGrid) {
    try {
      if (!availableDiscounts.length) {
        const { discounts } = await api.discounts();
        availableDiscounts = discounts;
      }
      discountGrid.innerHTML = availableDiscounts.slice(0, 3).map((discount, index) => `<article class="discount-card discount-card--${index + 1}"><div class="discount-card__top"><span>${discount.discount_type === "percentage" ? `${Number(discount.discount_value)}% OFF` : `${money(discount.discount_value)} OFF`}</span><span class="discount-card__spark">✳</span></div><h3>${escapeHtml(discount.title)}</h3><p>${escapeHtml(discount.description)}</p><div class="discount-card__code"><span>${escapeHtml(discount.coupon_code || "OFFER")}</span><button type="button" data-copy-code="${escapeHtml(discount.coupon_code || "")}">Copy</button></div><small>${escapeHtml(discountScope(discount))} · min. ${money(discount.minimum_purchase)} · until ${new Date(discount.expiry_date).toLocaleDateString()}</small><button type="button" class="discount-card__link" data-redeem-discount="${discount.id}">Check this offer <span>↗</span></button></article>`).join("") || `<p class="empty-copy empty-copy--light">More good offers are on the way.</p>`;
    } catch (error) { discountGrid.innerHTML = `<p class="inline-error inline-error--light">${escapeHtml(error.message)}</p>`; }
  }
  if (recommendationGrid) {
    if (!getToken()) {
      recommendationGrid.innerHTML = `<div class="personal-empty"><span>✳</span><div><h3>Your next favorites, waiting to be found.</h3><p>Sign in and your browsing and interests will shape a more personal edit.</p></div><a class="button button--dark" href="login.html">Sign in to explore <span>↗</span></a></div>`;
    } else {
      try {
        const result = await api.recommendations(4);
        const recommended = result.recommendations || [];
        if (recommended.length) {
          recommendationGrid.innerHTML = recommended.map((product) => cardMarkup(product)).join("");
        } else {
          const { products } = await api.products("sort=popular");
          recommendationGrid.innerHTML = products.slice(0, 4).map((product) => cardMarkup(product, { discountText: "Popular right now" })).join("");
        }
      } catch (error) {
        try {
          const { products } = await api.products("sort=popular");
          recommendationGrid.innerHTML = products.slice(0, 4).map((product) => cardMarkup(product, { discountText: "Popular right now" })).join("");
          showToast(`Showing popular picks. ${error.message}`, "info");
        } catch (fallbackError) { recommendationGrid.innerHTML = `<p class="inline-error">${escapeHtml(fallbackError.message)}</p>`; }
      }
    }
  }
}

async function loadCategoriesFilter(selected = "") {
  const select = document.querySelector("#category-filter");
  if (!select) return;
  try {
    const { categories } = await api.categories();
    select.innerHTML = `<option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("")}`;
    if (selected) select.value = selected;
  } catch (error) { showToast(error.message, "error"); }
}

async function loadCatalog() {
  const grid = document.querySelector("#product-grid");
  const form = document.querySelector("#product-filter-form");
  if (!grid || !form) return;
  const params = new URLSearchParams(window.location.search);
  const wishlistMode = params.get("view") === "wishlist";
  const title = document.querySelector("#catalog-title");
  const copy = document.querySelector("#catalog-copy");
  if (wishlistMode) {
    if (!requireAuth()) return;
    title.innerHTML = "Your <em>wishlist.</em>";
    copy.textContent = "A little collection of things you want to come back to.";
    form.closest(".catalog-toolbar").hidden = true;
  }
  try {
    const { discounts } = await api.discounts();
    availableDiscounts = discounts;
  } catch (error) { console.warn(error.message); }
  const [categoryResult, productResult] = await Promise.all([
    api.categories().catch(() => ({ categories: [] })),
    api.products().catch(() => ({ products: [] })),
    loadWishlistState(),
  ]);
  categoryNames = new Map(categoryResult.categories.map((category) => [category.id, category.name]));
  productNames = new Map(productResult.products.map((product) => [product.id, product.name]));
  await loadCategoriesFilter(params.get("category") || "");
  if (params.get("search")) form.elements.search.value = params.get("search");
  if (params.get("product")) await showProductDetail(params.get("product"));

  const render = async () => {
    grid.innerHTML = `<div class="loading-state">Updating your edit...</div>`;
    try {
      let products;
      if (wishlistMode) {
        const result = await api.wishlist();
        products = result.wishlist || [];
      } else {
        const query = new URLSearchParams();
        for (const key of ["search", "category", "min_price", "max_price", "sort"]) {
          const value = form.elements[key]?.value.trim();
          if (value) query.set(key, value);
        }
        const result = await api.products(query.toString());
        products = result.products || [];
      }
      const summary = document.querySelector("#results-summary");
      if (summary) summary.textContent = wishlistMode ? `${products.length} saved ${products.length === 1 ? "find" : "finds"}` : `${products.length} thoughtful ${products.length === 1 ? "find" : "finds"}`;
      grid.innerHTML = products.length
        ? products.map((product) => cardMarkup(product, { saved: wishlistMode })).join("")
        : `<div class="empty-state"><span class="empty-state__symbol">✳</span><h2>${wishlistMode ? "Your wishlist is ready." : "Nothing in this edit yet."}</h2><p>${wishlistMode ? "Tap the heart on a product to keep it close." : "Try another search or clear a filter to see more finds."}</p><a class="button button--dark" href="products.html">${wishlistMode ? "Explore products" : "See all products"} <span>↗</span></a></div>`;
    } catch (error) {
      grid.innerHTML = `<div class="empty-state empty-state--error"><span class="empty-state__symbol">!</span><h2>We couldn't load this edit.</h2><p>${escapeHtml(error.message)}</p><button class="button button--dark" type="button" data-retry-catalog>Try again</button></div>`;
    }
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
  form.elements.category.addEventListener("change", render);
  form.elements.sort.addEventListener("change", render);
  document.querySelector("#clear-filters")?.addEventListener("click", () => {
    form.reset();
    const url = new URL(window.location.href);
    ["search", "category", "min_price", "max_price", "sort", "product"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url);
    render();
  });
  document.querySelector("#product-detail")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-detail]")) {
      const detail = document.querySelector("#product-detail");
      detail.hidden = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("product");
      window.history.replaceState({}, "", url);
    }
  });
  grid.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry-catalog]")) await render();
  });
  await render();
}

async function handleDiscountActions(event) {
  const copyButton = event.target.closest("[data-copy-code]");
  const redeemButton = event.target.closest("[data-redeem-discount]");
  if (copyButton) {
    const code = copyButton.dataset.copyCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied ${code} to your clipboard.`, "success");
    } catch {
      showToast(`Your code is ${code}.`, "info");
    }
  }
  if (redeemButton) {
    if (!requireAuth()) return;
    setButtonLoading(redeemButton, true, "Checking");
    try {
      const result = await api.redeemDiscount(redeemButton.dataset.redeemDiscount);
      showToast(`Offer ready: ${money(result.discount_amount)} off eligible items. Add the offer at checkout.`, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setButtonLoading(redeemButton, false);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadHome();
  loadCatalog();
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-cart], [data-wishlist], [data-view-product]")) handleProductAction(event);
    if (event.target.closest("[data-copy-code], [data-redeem-discount]")) handleDiscountActions(event);
  });
});