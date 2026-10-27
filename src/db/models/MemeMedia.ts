import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { ResourceType } from './Meme.js';

/**
 * Um ficheiro de uma coleção, a seguir à capa. A capa (posição 0) fica nas colunas do
 * próprio meme, por isso um meme com um só ficheiro não tem linhas aqui.
 */
export class MemeMedia extends Model<InferAttributes<MemeMedia>, InferCreationAttributes<MemeMedia>> {
  declare id: CreationOptional<string>;
  declare memeId: string;
  /** A partir de 1, pela ordem do carrossel. */
  declare position: number;
  declare publicId: string;
  declare resourceType: ResourceType;
  declare format: string;
  declare bytes: number | null;
  declare durationMs: number | null;
  declare width: number | null;
  declare height: number | null;
}

export function initMemeMedia(sequelize: Sequelize) {
  MemeMedia.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      memeId: { type: DataTypes.UUID, allowNull: false },
      position: { type: DataTypes.SMALLINT, allowNull: false },
      publicId: { type: DataTypes.STRING, allowNull: false },
      resourceType: { type: DataTypes.STRING(16), allowNull: false },
      format: { type: DataTypes.STRING(16), allowNull: false },
      bytes: { type: DataTypes.INTEGER, allowNull: true },
      durationMs: { type: DataTypes.INTEGER, allowNull: true },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, tableName: 'meme_media', underscored: true, timestamps: false },
  );
}
