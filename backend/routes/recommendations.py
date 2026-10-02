from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from ml.discount_optimization import recommend_discount
from ml.price_sensitivity import calculate_price_sensitivity
from ml.recommendation import recommend_products
from ml.segmentation import segment_customers
from models import Order, OrderItem, Product, User, UserActivity, db


recommendations_bp = Blueprint("recommendations", __name__, url_prefix="/api/recommendations")


@recommendations_bp.get("")
@jwt_required()
def get_recommendations():
	user_id = int(get_jwt_identity())
	user = db.session.get(User, user_id)
	if user is None:
		return jsonify({"error": "User account no longer exists."}), 404

	activities = UserActivity.query.filter_by(user_id=user_id).order_by(UserActivity.created_at.asc()).all()
	orders = Order.query.filter_by(user_id=user_id).order_by(Order.created_at.asc()).all()
	purchased_product_ids = {
		item.product_id for order in orders for item in order.items
	}
	products = Product.query.filter(Product.stock > 0).all()
	popularity_rows = (
		db.session.query(UserActivity.product_id, func.count(UserActivity.id))
		.group_by(UserActivity.product_id)
		.all()
	)
	popularity = {product_id: count for product_id, count in popularity_rows}
	customers = User.query.filter_by(role="customer").all()
	all_orders = Order.query.all()
	all_activities = UserActivity.query.all()
	segments = segment_customers(customers, all_orders, all_activities)
	user_segment = segments.get(user_id, {"segment": "general"})
	sensitivity = calculate_price_sensitivity(orders, activities)

	limit = request.args.get("limit", default=8, type=int)
	limit = min(max(limit or 8, 1), 30)
	ranked_products = recommend_products(
		user,
		products,
		activities=activities,
		purchased_product_ids=purchased_product_ids,
		popularity=popularity,
		limit=limit,
	)
	recommendations = []
	for product in ranked_products:
		product_data = product.to_dict()
		product_data["suggested_discount"] = recommend_discount(
			user_segment.get("segment"),
			sensitivity,
			product.price,
			user_segment,
		)
		recommendations.append(product_data)

	return jsonify({
		"recommendations": recommendations,
		"customer_segment": user_segment,
		"price_sensitivity": sensitivity,
	})
