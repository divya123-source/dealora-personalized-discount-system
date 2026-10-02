def calculate_price_sensitivity(orders=None, activities=None):
	"""Return a deterministic 0..1 sensitivity score; higher means more price-sensitive."""
	purchase_prices = []
	for order in orders or []:
		for item in order.items:
			purchase_prices.append(float(item.price))
	viewed_prices = [
		float(activity.product.price)
		for activity in activities or []
		if activity.product and activity.activity_type in {"view", "click", "cart", "wishlist"}
	]

	if not purchase_prices or not viewed_prices:
		return 0.5
	average_paid = sum(purchase_prices) / len(purchase_prices)
	average_considered = sum(viewed_prices) / len(viewed_prices)
	if average_considered <= 0:
		return 0.5

	relative_price = min(max(average_paid / average_considered, 0.0), 1.5)
	price_component = 1.0 - min(relative_price, 1.0)
	conversion_component = min(len(purchase_prices) / max(len(viewed_prices), 1), 1.0)
	score = 0.75 * price_component + 0.25 * (1.0 - conversion_component)
	return round(min(max(score, 0.0), 1.0), 3)
