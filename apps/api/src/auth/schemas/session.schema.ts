import { SessionRevokedReason } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'sessions',
  timestamps: true,
})
export class Session {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  deviceId!: string;

  @Prop({ required: true })
  deviceName!: string;

  @Prop({ required: true, unique: true, index: true })
  refreshTokenHash!: string;

  @Prop({ required: true, index: true })
  refreshTokenFamily!: string;

  @Prop({ type: [String], default: [] })
  previousHashes!: string[];

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt!: Date;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, enum: Object.values(SessionRevokedReason), default: null })
  revokedReason!: SessionRevokedReason | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = Session & Document;

/**
 * Domain type for sessions, crossing the repository boundary.
 * Ids are plain strings — Mongo's ObjectId is an infrastructure detail that
 * must not leak into the service layer (see CLAUDE.md).
 */
export interface SessionRecord {
  id: string;
  xid: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  refreshTokenHash: string;
  refreshTokenFamily: string;
  previousHashes: string[];
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevokedReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSessionRecord(doc: Session): SessionRecord {
  return {
    id: doc._id.toString(),
    xid: doc.xid,
    userId: doc.userId.toString(),
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    refreshTokenHash: doc.refreshTokenHash,
    refreshTokenFamily: doc.refreshTokenFamily,
    previousHashes: doc.previousHashes ?? [],
    lastUsedAt: doc.lastUsedAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    revokedReason: doc.revokedReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Compound covers userId-only queries via leftmost-prefix, so no standalone userId index.
SessionSchema.index({ userId: 1, deviceId: 1, revokedAt: 1 });
SessionSchema.index({ refreshTokenFamily: 1, revokedAt: 1 });
// Replay lookup on rotation: findByPreviousHash({ previousHashes: hash })
SessionSchema.index({ previousHashes: 1 });
// TTL: auto-drop documents once expiresAt is in the past. Revoked-but-not-yet-expired
// rows are correctly retained — replay detection needs them during their TTL window.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
