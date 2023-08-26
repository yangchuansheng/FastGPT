import { Schema, model, models, Model } from 'mongoose';
import { kbSchema as SchemaType } from '@/types/mongoSchema';

const kbSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-ada-002'
  },
  tags: {
    type: [String],
    default: []
  }
});

export const KB: Model<SchemaType> = models['kb'] || model('kb', kbSchema);
