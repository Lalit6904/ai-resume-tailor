import mongoose from 'mongoose';

const editSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TailoringSession', required: true, index: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    locationId: { type: String, required: true },
    part: { type: String, required: true },
    sectionName: { type: String, default: 'General' },
    originalText: { type: String, required: true },
    proposedText: { type: String, required: true },
    finalText: { type: String, default: null },
    reason: { type: String, required: true },
    evidence: { type: String, default: '' },
    requirementIds: { type: [String], default: [] },
    risk: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'modified'],
      default: 'pending',
      index: true,
    },
    validation: {
      status: { type: String, enum: ['valid', 'warning'], default: 'valid' },
      warnings: [String],
      formatting: { type: String, enum: ['full', 'partial'], default: 'full' },
    },
    version: { type: Number, default: 1 },
    order: { type: Number, default: 0 },
    ai: {
      provider: String,
      model: String,
    },
    decidedAt: Date,
    reviewedAt: Date,
  },
  { timestamps: true },
);

// One active suggestion per document location. This makes conflicting edits
// structurally impossible and keeps export deterministic.
editSchema.index({ sessionId: 1, locationId: 1 }, { unique: true });
editSchema.index({ sessionId: 1, order: 1 });
editSchema.index({ userId: 1, createdAt: -1 });

editSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    sessionId: this.sessionId.toString(),
    locationId: this.locationId,
    part: this.part,
    sectionName: this.sectionName,
    originalText: this.originalText,
    proposedText: this.proposedText,
    finalText: this.finalText,
    effectiveText: this.status === 'modified' && this.finalText ? this.finalText : this.proposedText,
    reason: this.reason,
    evidence: this.evidence,
    requirementIds: this.requirementIds,
    risk: this.risk,
    status: this.status,
    validation: this.validation,
    version: this.version,
    order: this.order,
    ai: this.ai,
    decidedAt: this.decidedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const ResumeEdit = mongoose.model('ResumeEdit', editSchema);
