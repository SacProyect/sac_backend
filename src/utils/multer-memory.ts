import multer from "multer";

// Storage in memory, no local files
const storage = multer.memoryStorage();

export const uploadMemory = multer({ storage });