import re

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from models import User, db


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def current_user():
	identity = get_jwt_identity()
	return db.session.get(User, int(identity)) if identity is not None else None


@auth_bp.post("/register")
def register():
	data = request.get_json(silent=True) or {}
	name = str(data.get("name", "")).strip()
	email = str(data.get("email", "")).strip().lower()
	password = data.get("password")

	if not name:
		return jsonify({"error": "Name is required."}), 400
	if not EMAIL_PATTERN.match(email):
		return jsonify({"error": "A valid email address is required."}), 400
	if not isinstance(password, str) or len(password) < 8:
		return jsonify({"error": "Password must contain at least 8 characters."}), 400
	if User.query.filter_by(email=email).first():
		return jsonify({"error": "An account with this email already exists."}), 409

	preferences = data.get("preferences", [])
	if not isinstance(preferences, (list, dict)):
		return jsonify({"error": "Preferences must be a list or object."}), 400
	try:
		age = int(data["age"]) if data.get("age") not in (None, "") else None
	except (TypeError, ValueError):
		return jsonify({"error": "Age must be a whole number."}), 400
	if age is not None and not 13 <= age <= 120:
		return jsonify({"error": "Age must be between 13 and 120."}), 400

	user = User(
		name=name,
		email=email,
		role="customer",
		age=age,
		location=str(data.get("location", "")).strip() or None,
		preferences=preferences,
	)
	user.set_password(password)
	db.session.add(user)
	db.session.commit()
	return jsonify({"message": "Account created.", "user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
	data = request.get_json(silent=True) or {}
	email = str(data.get("email", "")).strip().lower()
	password = data.get("password")
	user = User.query.filter_by(email=email).first()
	if not user or not isinstance(password, str) or not user.check_password(password):
		return jsonify({"error": "Invalid email or password."}), 401

	token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
	return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.get("/me")
@jwt_required()
def me():
	user = current_user()
	if user is None:
		return jsonify({"error": "User account no longer exists."}), 404
	return jsonify({"user": user.to_dict()})


@auth_bp.put("/profile")
@jwt_required()
def update_profile():
	user = current_user()
	if user is None:
		return jsonify({"error": "User account no longer exists."}), 404
	data = request.get_json(silent=True) or {}

	if "name" in data:
		name = str(data["name"]).strip()
		if not name:
			return jsonify({"error": "Name cannot be empty."}), 400
		user.name = name
	if "age" in data:
		try:
			age = int(data["age"]) if data["age"] not in (None, "") else None
		except (TypeError, ValueError):
			return jsonify({"error": "Age must be a whole number."}), 400
		if age is not None and not 13 <= age <= 120:
			return jsonify({"error": "Age must be between 13 and 120."}), 400
		user.age = age
	if "location" in data:
		user.location = str(data["location"]).strip() or None
	if "preferences" in data:
		if not isinstance(data["preferences"], (list, dict)):
			return jsonify({"error": "Preferences must be a list or object."}), 400
		user.preferences = data["preferences"]

	db.session.commit()
	return jsonify({"message": "Profile updated.", "user": user.to_dict()})
