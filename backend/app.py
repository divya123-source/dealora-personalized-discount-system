import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from config import Config
from models import db, jwt


FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


def create_app(config_class=Config):
	app = Flask(__name__)
	app.config.from_object(config_class)
	db.init_app(app)
	jwt.init_app(app)

	cors_origins = app.config.get("CORS_ORIGINS", "*")
	if isinstance(cors_origins, str) and cors_origins != "*":
		cors_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
	CORS(app, resources={r"/api/*": {"origins": cors_origins}})

	from routes.admin import admin_bp
	from routes.auth import auth_bp
	from routes.discounts import discounts_bp
	from routes.notifications import notifications_bp
	from routes.orders import orders_bp
	from routes.products import products_bp
	from routes.recommendations import recommendations_bp

	for blueprint in (
		auth_bp,
		products_bp,
		discounts_bp,
		orders_bp,
		recommendations_bp,
		admin_bp,
		notifications_bp,
	):
		app.register_blueprint(blueprint)

	@app.get("/api/health")
	def health():
		return jsonify({"status": "ok", "message": "Dealora API is running"})

	@app.get("/")
	def frontend_home():
		return send_from_directory(FRONTEND_DIR, "index.html")

	@app.get("/<path:filename>")
	def frontend_file(filename):
		return send_from_directory(FRONTEND_DIR, filename)

	with app.app_context():
		db.create_all()
		if os.environ.get("DEALORA_SEED_DEMO_DATA", "").lower() in {"1", "true", "yes"}:
			from seed import seed_database

			seed_database(app)

	return app


if __name__ == "__main__":
	application = create_app()
	application.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", "5000")), debug=False)
