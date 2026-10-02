import os


BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
	SECRET_KEY = os.environ.get("DEALORA_SECRET_KEY", "***REMOVED***")
	JWT_SECRET_KEY = os.environ.get("DEALORA_JWT_SECRET_KEY", SECRET_KEY)
	SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(BASE_DIR, "dealora.db")
	SQLALCHEMY_TRACK_MODIFICATIONS = False
	JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 12
	CORS_ORIGINS = os.environ.get("DEALORA_CORS_ORIGINS", "*")
