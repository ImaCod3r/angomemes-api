import multer from 'multer';
import { AppError } from '../errors.js';
import { isMemeType, MAX_UPLOAD_BYTES, MEME_TYPE_RULES, tooLargeMessage } from '../modules/memes/memeTypes.js';

/**
 * Guarda o ficheiro em memória, mas corta logo que passa o limite do tipo escolhido,
 * em vez de acumular até ao limite máximo (50 MB) e só depois recusar.
 */
const sizeLimitedMemoryStorage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    const type = req.body?.type;
    const limit = isMemeType(type) ? MEME_TYPE_RULES[type].maxBytes : MAX_UPLOAD_BYTES;
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;

    file.stream.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        chunks.length = 0;
        file.stream.resume();
        cb(new AppError(413, 'FILE_TOO_LARGE', isMemeType(type) ? tooLargeMessage(type) : 'Ficheiro demasiado grande.'));
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on('error', (err) => {
      if (done) return;
      done = true;
      cb(err);
    });
    file.stream.on('end', () => {
      if (done) return;
      done = true;
      cb(null, { buffer: Buffer.concat(chunks), size });
    });
  },

  _removeFile(_req, file, cb) {
    delete (file as Partial<Express.Multer.File>).buffer;
    cb(null);
  },
};

/** Campo `file` do multipart. O campo `type` tem de vir antes, para se saber o limite. */
export const uploadMemeFile = multer({
  storage: sizeLimitedMemoryStorage,
  limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 20, fieldSize: 10 * 1024 },
  fileFilter(req, _file, cb) {
    if (!isMemeType(req.body?.type)) {
      cb(new AppError(400, 'TYPE_REQUIRED', 'O campo "type" (video, image ou audio) tem de vir antes do ficheiro.'));
      return;
    }
    cb(null, true);
  },
}).single('file');
