def recommend_discount(segment, price_sensitivity, product_price, purchase_behavior=None):
	"""Suggest a bounded deterministic percentage discount for one customer/product pair."""
	behavior = purchase_behavior or {}
	try:
		sensitivity = min(max(float(price_sensitivity), 0.0), 1.0)
		price = max(float(product_price), 0.0)
		purchase_frequency = max(int(behavior.get("purchase_frequency", 0)), 0)
		average_order_value = max(float(behavior.get("average_order_value", 0)), 0.0)
	except (TypeError, ValueError):
		raise ValueError("Sensitivity, product price, and purchase behavior must be numeric.")

	percentage = 5.0 + sensitivity * 12.0
	segment_name = str(segment or "general").lower()
	if segment_name in {"value_1", "low_value", "at_risk", "new", "general"}:
		percentage += 3.0
	elif segment_name in {"value_3", "high_value", "loyal"}:
		percentage -= 2.0
	if purchase_frequency == 0:
		percentage += 2.0
	elif purchase_frequency >= 5:
		percentage -= 1.0
	if average_order_value and price > average_order_value * 1.5:
		percentage += 1.0

	percentage = round(min(max(percentage, 5.0), 25.0), 1)
	discount_amount = round(price * percentage / 100.0, 2)
	return {
		"discount_type": "percentage",
		"discount_value": percentage,
		"estimated_discount_amount": discount_amount,
		"estimated_price_after_discount": round(max(price - discount_amount, 0.0), 2),
		"reason": "Adjusted for customer price sensitivity, segment, and purchase history.",
	}
