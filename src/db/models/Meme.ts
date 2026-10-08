import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Tag } from './Tag.js';
import type { User } from './User.js';

export const MEME_TYPES = ['video', 'image', 'audio'] as const;
export type MemeType = (typeof MEME_TYPES)[number];

export const MEME_STATUSES = ['pending', 'published', 'rejected', 'removed'] as const;
export type MemeStatus = (typeof MEME_STATUSES)[number];

export type ResourceType = 'video' | 'image';

export class Meme extends Model<InferAttributes<Meme>, InferCreationAttributes<Meme>> {
  declare id: CreationOptional<string>;
  declare type: MemeType;
  declare title: string;
  /** Fixo depois de criado: editar o título não parte os links partilhados. */
  declare slug: string;
  declare status: MemeStatus;
  declare publicId: string;
  declare resourceType: ResourceType;
  declare format: string;
  declare bytes: number | null;
  declare durationMs: number | null;
  declare width: number | null;
  declare height: number | null;
  declare uploadedBy: string;
  declare reviewedBy: CreationOptional<string | null>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare rejectionReason: CreationOptional<string | null>;
  declare publishedAt: Date | null;
  /** Quantas vezes foi descarregado; desempata a ordenação por populares. */
  declare downloadsCount: CreationOptional<number>;
  /** Quantas contas deram like; atualizado na mesma transação de cada like. */
  declare likesCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;

  declare tags?: NonAttribute<Tag[]>;
  declare uploader?: NonAttribute<User>;
}

export function initMeme(sequelize: Sequelize) {
  Meme.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [MEME_TYPES] } },
      title: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(90), allowNull: false, unique: true },
      status: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [MEME_STATUSES] } },
      publicId: { type: DataTypes.STRING, allowNull: false },
      resourceType: { type: DataTypes.STRING(16), allowNull: false },
      format: { type: DataTypes.STRING(16), allowNull: false },
      bytes: { type: DataTypes.INTEGER, allowNull: true },
      durationMs: { type: DataTypes.INTEGER, allowNull: true },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
      uploadedBy: { type: DataTypes.UUID, allowNull: false },
      reviewedBy: { type: DataTypes.UUID, allowNull: true },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.STRING(300), allowNull: true },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      downloadsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      likesCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'memes', underscored: true, updatedAt: false },
  );
}
