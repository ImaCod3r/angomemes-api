import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/** Chave da API pública. A chave completa nunca é guardada: só o hash e o prefixo. */
export class ApiKey extends Model<InferAttributes<ApiKey>, InferCreationAttributes<ApiKey>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare name: string;
  /** Início da chave, para a pessoa a reconhecer na lista (ex.: "am_k3J9xQ2b"). */
  declare prefix: string;
  declare keyHash: string;
  declare createdAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare revokedAt: CreationOptional<Date | null>;
}

export function initApiKey(sequelize: Sequelize) {
  ApiKey.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(60), allowNull: false },
      prefix: { type: DataTypes.STRING(16), allowNull: false },
      keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      createdAt: DataTypes.DATE,
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, tableName: 'api_keys', underscored: true, updatedAt: false },
  );
}
