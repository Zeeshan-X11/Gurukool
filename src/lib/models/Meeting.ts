// Ported from SparkMeet: backend/src/models/meeting.model.js
// Preserves original schema (user_id, meetingCode, date).
import mongoose, { Schema } from "mongoose";

export interface IMeeting {
  user_id: string;        // GURUKOOL user _id (string)
  meetingCode: string;
  date: Date;
}

const meetingSchema = new Schema<IMeeting>({
  user_id: { type: String, required: true },
  meetingCode: { type: String, required: true },
  date: { type: Date, default: Date.now, required: true },
});

export const Meeting =
  (mongoose.models.Meeting as mongoose.Model<IMeeting>) ||
  mongoose.model<IMeeting>("Meeting", meetingSchema);
