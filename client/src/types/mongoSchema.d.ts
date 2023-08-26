import type { ChatItemType } from './chat';
import { ModelNameEnum, ChatModelType, EmbeddingModelType } from '@/constants/model';
import type { DataType } from './data';
import { BillSourceEnum, InformTypeEnum } from '@/constants/user';
import { TrainingModeEnum } from '@/constants/plugin';
import type { AppModuleItemType } from './app';
import { ChatSourceEnum, OutLinkTypeEnum } from '@/constants/chat';
import { AppTypeEnum } from '@/constants/app';

export interface UserModelSchema {
  _id: string;
  username: string;
  password: string;
  avatar: string;
  balance: number;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  openaiAccount?: {
    key: string;
    baseUrl: string;
  };
  limit: {
    exportKbTime?: Date;
  };
}

export interface AuthCodeSchema {
  _id: string;
  username: string;
  code: string;
  type: 'register' | 'findPassword';
  expiredTime: number;
}

export interface AppSchema {
  _id: string;
  userId: string;
  name: string;
  type: `${AppTypeEnum}`;
  avatar: string;
  intro: string;
  updateTime: number;
  share: {
    isShare: boolean;
    isShareDetail: boolean;
    collection: number;
  };
  modules: AppModuleItemType[];
  chat?: {
    relatedKbs: string[];
    searchSimilarity: number;
    searchLimit: number;
    searchEmptyText: string;
    systemPrompt: string;
    limitPrompt: string;
    temperature: number;
    maxToken: number;
    chatModel: ChatModelType; // 聊天时用的模型，训练后就是训练的模型
  };
}

export interface CollectionSchema {
  appId: string;
  userId: string;
}

export interface TrainingDataSchema {
  _id: string;
  userId: string;
  kbId: string;
  expireAt: Date;
  lockTime: Date;
  vectorModel: string;
  mode: `${TrainingModeEnum}`;
  prompt: string;
  q: string;
  a: string;
  source: string;
}

export interface ChatSchema {
  _id: string;
  chatId: string;
  userId: string;
  appId: string;
  updateTime: Date;
  title: string;
  customTitle: string;
  top: boolean;
  variables: Record<string, any>;
  source: `${ChatSourceEnum}`;
  shareId?: string;
  isInit: boolean;
  content: ChatItemType[];
}

export interface ChatItemSchema extends ChatItemType {
  dataId: string;
  chatId: string;
  userId: string;
  appId: string;
  time: Date;
  userFeedback?: string;
  adminFeedback?: string;
}

export type BillListItemType = {
  moduleName: string;
  amount: number;
  model?: string;
  tokenLen?: number;
};
export interface BillSchema {
  _id: string;
  userId: string;
  appName: string;
  appId?: string;
  source: `${BillSourceEnum}`;
  time: Date;
  total: number;
  list: BillListItemType[];
}

export interface PaySchema {
  _id: string;
  userId: string;
  createTime: Date;
  price: number;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
}

export interface OpenApiSchema {
  _id: string;
  userId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: String;
}

export interface PromotionRecordSchema {
  _id: string;
  userId: string; // 收益人
  objUId?: string; // 目标对象（如果是withdraw则为空）
  type: 'register' | 'pay';
  createTime: Date; // 记录时间
  amount: number;
}

export interface OutLinkSchema {
  _id: string;
  shareId: string;
  userId: string;
  appId: string;
  name: string;
  total: number;
  lastTime: Date;
  type: `${OutLinkTypeEnum}`;
}

export interface kbSchema {
  _id: string;
  userId: string;
  updateTime: Date;
  avatar: string;
  name: string;
  vectorModel: string;
  tags: string[];
}

export interface informSchema {
  _id: string;
  userId: string;
  time: Date;
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  read: boolean;
}
