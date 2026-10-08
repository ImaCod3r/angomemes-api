import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

/** Um like de uma conta num meme; a chave composta impede o segundo. */
export class Like extends Model<InferAttributes<Like>, InferCreationAttributes<Like>> {
  declare userId: string;
  declare memeId: string;
  declare createdAt: CreationOptional<Date>;
}

export function initLike(sequelize: Sequelize) {
  Like.init(
    {
      userId: { type: DataTypes.UUID, primaryKey: true },
      memeId: { type: DataTypes.UUID, primaryKey: true },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'likes', underscored: true, updatedAt: false },
  );
}
