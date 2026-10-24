import mongoose from 'mongoose';

const exportSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TailoringSession', required: true, index: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storageKey: { type: String, default: null },
    previewStorageKey: { type: String, default: null },
    filename: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    sha256: { type: String, default: '' },
    sourceEditVersion: { type: Number, required: true },
    appliedEditIds: { type: [String], default: [] },
    excluded: {
      pending: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
    validation: {
      status: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
      checks: [
        {
          name: String,
          passed: Boolean,
          details: String,
        },
      ],
      warnings: [String],
      pageCount: Number,
      originalPageCount: Number,
      renderer: String,
    },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed', 'expired'],
      default: 'processing',
      index: true,
    },
    error: {
      code: String,
      message: String,
    },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

exportSchema.index({ sessionId: 1, createdAt: -1 });
exportSchema.index({ userId: 1, createdAt: -1 });

exportSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    sessionId: this.sessionId.toString(),
    resumeId: this.resumeId.toString(),
    filename: this.filename,
    sizeBytes: this.sizeBytes,
    sha256: this.sha256,
    previewAvailable: Boolean(this.previewStorageKey),
    sourceEditVersion: this.sourceEditVersion,
    appliedEditIds: this.appliedEditIds,
    excluded: this.excluded,
    validation: this.validation,
    status: this.status,
    error: this.error?.code ? this.error : null,
    expiresAt: this.expiresAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const ResumeExport = mongoose.model('ResumeExport', exportSchema);
