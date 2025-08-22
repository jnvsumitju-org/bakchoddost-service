import mongoose from "mongoose";

const PoemTemplateSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    instructions: { type: String, default: "Use placeholders like {{userName}}, {{friendName1}}, {{friendName2}}..." },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", index: true, default: null },
    usageCount: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

export const PoemTemplate =
  mongoose.models.PoemTemplate || mongoose.model("PoemTemplate", PoemTemplateSchema);


