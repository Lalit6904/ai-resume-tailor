import mongoose from 'mongoose';

const requirementSchema = new mongoose.Schema(
  {
    id: String,
    text: String,
    type: { type: String, enum: ['required', 'preferred', 'responsibility', 'qualification', 'tool', 'other'] },
    category: String,
    importance: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    status: {
      type: String,
      enum: ['demonstrated', 'partially_demonstrated', 'not_evidenced', 'pending'],
      default: 'pending',
    },
    evidence: [String],
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    label: { type: String, default: 'Untitled role' },
    jobDescription: { type: String, required: true },
    jobDescriptionHash: { type: String, required: true },
    jobAnalysis: {
      jobTitle: String,
      seniority: String,
      requiredSkills: [String],
      preferredSkills: [String],
      responsibilities: [String],
      qualifications: [String],
      tools: [String],
      terminology: [String],
      experienceRequirements: String,
    },
    requirements: [requirementSchema],
    matchingSummary: {
      total: Number,
      demonstrated: Number,
      partiallyDemonstrated: Number,
      notEvidenced: Number,
    },
    ai: {
      provider: String,
      model: String,
      warnings: [String],
      discarded: [
        {
          locationId: String,
          reason: String,
          code: String,
        },
      ],
    },
    status: {
      type: String,
      enum: ['queued', 'analyzing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    stage: {
      type: String,
      enum: [
        'queued',
        'analyzing_job',
        'analyzing_resume',
        'generating_suggestions',
        'completed',
        'failed',
      ],
      default: 'queued',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    error: {
      code: String,
      message: String,
      recoverable: Boolean,
      retryable: Boolean,
    },
    editVersion: { type: Number, default: 1 },
    suggestionCount: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

sessionSchema.index({ resumeId: 1, createdAt: -1 });
sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ status: 1, updatedAt: 1 });

sessionSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    resumeId: this.resumeId.toString(),
    label: this.label,
    jobTitle: this.jobAnalysis?.jobTitle || null,
    jobDescription: this.jobDescription,
    jobAnalysis: this.jobAnalysis || null,
    requirements: this.requirements || [],
    matchingSummary: this.matchingSummary || null,
    ai: this.ai || null,
    status: this.status,
    stage: this.stage,
    progress: this.progress,
    error: this.error?.code ? this.error : null,
    editVersion: this.editVersion,
    suggestionCount: this.suggestionCount,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const TailoringSession = mongoose.model('TailoringSession', sessionSchema);
