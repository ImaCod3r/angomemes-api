import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { MemeType, ResourceType } from './Meme.js';

/**
 * Autorização para enviar um ficheiro direto do browser para o Cloudinary.
 * O backend escolhe o `public_id` e assina o envio; o meme só é criado quando o dono
 * reclama o ticket. Tickets que expiram sem ser reclamados têm o ficheiro apagado.
 */
export class UploadTicket extends Model<InferAttributes<UploadTicket>, InferCreationAttributes<UploadTicket>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare type: MemeType;
  declare resourceType: ResourceType;
  declare publicId: string;
  declare visibility: 'public' | 'private';
  declare createdAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare claimedAt: CreationOptional<Date | null>;
}

export function initUploadTicket(sequelize: Sequelize) {
  UploadTicket.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.STRING(16), allowNull: false },
      resourceType: { type: DataTypes.STRING(16), allowNull: false },
      publicId: { type: DataTypes.STRING, allowNull: false, unique: true },
      visibility: { type: DataTypes.STRING(16), allowNull: false },
      createdAt: DataTypes.DATE,
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      claimedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, tableName: 'upload_tickets', underscored: true, updatedAt: false },
  );
}
