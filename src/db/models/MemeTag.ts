import { DataTypes, Model, type InferAttributes, type InferCreationAttributes, type Sequelize } from 'sequelize';

export class MemeTag extends Model<InferAttributes<MemeTag>, InferCreationAttributes<MemeTag>> {
  declare memeId: string;
  declare tagId: string;
}

export function initMemeTag(sequelize: Sequelize) {
  MemeTag.init(
    {
      memeId: { type: DataTypes.UUID, primaryKey: true },
      tagId: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, tableName: 'meme_tags', underscored: true, timestamps: false },
  );
}
