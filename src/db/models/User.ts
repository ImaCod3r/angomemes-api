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
  declare avatarUrl: string | null;
  declare role: CreationOptional<Role>;
  declare createdAt: CreationOptional<Date>;
}

export function initUser(sequelize: Sequelize) {
  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      googleSub: { type: DataTypes.STRING, allowNull: false, unique: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      avatarUrl: { type: DataTypes.TEXT, allowNull: true },
      role: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'user',
        validate: { isIn: [ROLES] },
      },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'users', underscored: true, updatedAt: false },
  );
}
