import mongoose from 'mongoose';

const paragraphSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    part: { type: String, required: true },
    kind: { type: String, enum: ['body', 'table', 'header', 'footer'], required: true },
    index: { type: Number, required: true },
    text: { type: String, default: '' },
    section: { type: String, default: 'General' },
    styleId: { type: String, default: null },
    styleName: { type: String, default: null },
    isHeading: { type: Boolean, default: false },
    headingLevel: { type: Number, default: null },
    editable: { type: Boolean, default: false },
    reasons: { type: [String], default: [] },
    runCount: { type: Number, default: 0 },
    mixedFormatting: { type: Boolean, default: false },
    tableContext: {
      tableIndex: Number,
      rowIndex: Number,
      cellIndex: Number,
    },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    name: String,
    headingLevel: Number,
    paragraphCount: Number,
  },
  { _id: false },
);

const resumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFilename: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: {
      type: String,
      default: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    parseStatus: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true,
    },
    parseError: {
      code: String,
      message: String,
    },
    document: {
      documentHash: String,
      paragraphCount: Number,
      editableCount: Number,
      wordCount: Number,
      sections: [sectionSchema],
      counts: {
        tables: Number,
        images: Number,
        headers: Number,
        footers: Number,
        hyperlinks: Number,
        lists: Number,
      },
      warnings: [String],
      unsupported: [String],
      paragraphs: [paragraphSchema],
    },
    exportCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

resumeSchema.index({ userId: 1, createdAt: -1 });

resumeSchema.methods.toSummaryJSON = function toSummaryJSON() {
  const doc = this.document || {};
  return {
    id: this._id.toString(),
    originalFilename: this.originalFilename,
    sizeBytes: this.sizeBytes,
    mimeType: this.mimeType,
    parseStatus: this.parseStatus,
    parseError: this.parseError || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    expiresAt: this.expiresAt,
    exportCount: this.exportCount,
    document: {
      documentHash: doc.documentHash,
      paragraphCount: doc.paragraphCount || 0,
      editableCount: doc.editableCount || 0,
      wordCount: doc.wordCount || 0,
      sections: doc.sections || [],
      counts: doc.counts || {},
      warnings: doc.warnings || [],
      unsupported: doc.unsupported || [],
    },
  };
};

resumeSchema.methods.toDetailJSON = function toDetailJSON() {
  return {
    ...this.toSummaryJSON(),
    paragraphs: (this.document?.paragraphs || []).map((p) => ({
      id: p.id,
      kind: p.kind,
      text: p.text,
      section: p.section,
      styleName: p.styleName,
      isHeading: p.isHeading,
      editable: p.editable,
      reasons: p.reasons,
      runCount: p.runCount,
      mixedFormatting: p.mixedFormatting,
    })),
  };
};

export const Resume = mongoose.model('Resume', resumeSchema);
