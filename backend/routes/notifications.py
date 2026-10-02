from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import Notification, db


notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.get("")
@jwt_required()
def list_notifications():
	user_id = int(get_jwt_identity())
	notifications = (
		Notification.query.filter_by(user_id=user_id)
		.order_by(Notification.created_at.desc(), Notification.id.desc())
		.all()
	)
	return jsonify({"notifications": [item.to_dict() for item in notifications]})


@notifications_bp.put("/<int:notification_id>/read")
@jwt_required()
def mark_notification_read(notification_id):
	user_id = int(get_jwt_identity())
	notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
	if notification is None:
		return jsonify({"error": "Notification not found."}), 404
	notification.is_read = True
	db.session.commit()
	return jsonify({"notification": notification.to_dict()})


@notifications_bp.put("/read-all")
@jwt_required()
def mark_all_notifications_read():
	user_id = int(get_jwt_identity())
	updated = Notification.query.filter_by(user_id=user_id, is_read=False).update({"is_read": True})
	db.session.commit()
	return jsonify({"message": "Notifications marked as read.", "updated_count": updated})
