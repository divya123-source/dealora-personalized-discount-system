from collections import defaultdict

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


ACTIVITY_WEIGHTS = {"view": 1.0, "click": 1.5, "cart": 3.0, "wishlist": 3.0, "purchase": 4.0}


def _preference_text(preferences):
	if isinstance(preferences, dict):
		values = []
		for key, value in preferences.items():
			values.append(str(key))
			if isinstance(value, (list, tuple, set)):
				values.extend(str(item) for item in value)
			else:
				values.append(str(value))
		return " ".join(values)
	if isinstance(preferences, (list, tuple, set)):
		return " ".join(str(item) for item in preferences)
	return str(preferences or "")


def recommend_products(user, products, activities=None, purchased_product_ids=None,
					   popularity=None, limit=8):
	"""Rank available products from user interests, interactions, and overall popularity."""
	products = [product for product in products if product.stock > 0]
	if not products or limit <= 0:
		return []

	activities = activities or []
	purchased_product_ids = set(purchased_product_ids or ())
	popularity = popularity or {}
	category_scores = defaultdict(float)
	product_scores = defaultdict(float)
	for activity in activities:
		weight = ACTIVITY_WEIGHTS.get(activity.activity_type, 0.5)
		product_scores[activity.product_id] += weight
		if activity.product and activity.product.category:
			category_scores[activity.product.category.name.lower()] += weight

	documents = ["{} {} {} {}".format(
		product.name or "",
		product.description or "",
		product.brand or "",
		product.category.name if product.category else "",
	) for product in products]
	preference_text = _preference_text(getattr(user, "preferences", []))
	profile_parts = [preference_text]
	profile_parts.extend(
		category for category, _score in sorted(category_scores.items(), key=lambda pair: pair[1], reverse=True)
	)
	profile_parts.extend(
		activity.product.name
		for activity in activities
		if activity.activity_type in {"cart", "wishlist", "purchase"} and activity.product
	)
	profile = " ".join(part for part in profile_parts if part).strip()

	similarity_scores = [0.0] * len(products)
	if profile:
		try:
			vectorizer = TfidfVectorizer(stop_words="english")
			matrix = vectorizer.fit_transform(documents + [profile])
			similarity_scores = cosine_similarity(matrix[-1], matrix[:-1]).ravel().tolist()
		except ValueError:
			similarity_scores = [0.0] * len(products)

	max_popularity = max([float(popularity.get(product.id, 0)) for product in products] + [1.0])
	ranked = []
	for index, product in enumerate(products):
		if product.id in purchased_product_ids:
			continue
		category_name = product.category.name.lower() if product.category else ""
		category_score = category_scores.get(category_name, 0.0)
		category_score = category_score / max(category_scores.values()) if category_scores else 0.0
		personal_score = max(similarity_scores[index], category_score * 0.8,
							 min(product_scores.get(product.id, 0.0) / 4.0, 1.0))
		popular_score = float(popularity.get(product.id, 0)) / max_popularity
		ranked.append((personal_score * 0.75 + popular_score * 0.25, product))

	ranked.sort(key=lambda pair: (-pair[0], pair[1].id))
	return [product for _score, product in ranked[:limit]]
