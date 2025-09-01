import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AdminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: false, unique: true, lowercase: true, trim: true, sparse: true },
    password: { type: String, required: false, minlength: 6 },
    phone: { type: String, required: false, unique: true, trim: true, sparse: true },
    username: { type: String, required: false, unique: true, lowercase: true, trim: true, sparse: true },
    name: { type: String, required: false, trim: true },
    otpCode: { type: String, required: false },
    otpExpiresAt: { type: Date, required: false },
  },
  { timestamps: true }
);

AdminUserSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

AdminUserSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const AdminUser = mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema);


