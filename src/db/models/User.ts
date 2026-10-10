import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare googleSub: string;
  declare email: string;
  declare name: string;
  /** Fixo depois de criado: é o que aparece no URL do perfil. */
  declare username: string;
  declare avatarUrl: string | null;
  declare role: CreationOptional<Role>;
  /** Vai no token de sessão: incrementar termina todas as sessões da conta. */
  declare sessionVersion: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

export function initUser(sequelize: Sequelize) {
  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      googleSub: { type: DataTypes.STRING, allowNull: false, unique: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      username: { type: DataTypes.STRING(40), allowNull: false, unique: true },
      avatarUrl: { type: DataTypes.TEXT, allowNull: true },
      role: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'user',
        validate: { isIn: [ROLES] },
      },
      sessionVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'users', underscored: true, updatedAt: false },
  );
}
