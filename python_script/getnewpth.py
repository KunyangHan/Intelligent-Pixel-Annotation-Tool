from datetime import datetime
import scipy.misc as sm
from collections import OrderedDict
import glob
import numpy as np
import matplotlib.pyplot as plt
import socket

# PyTorch includes
import torch
import torch.optim as optim
from torchvision import transforms
from torch.utils.data import DataLoader
from torch.nn.functional import upsample

# Custom includes
from dataloaders.combine_dbs import CombineDBs as combine_dbs
import dataloaders.pascal as pascal
import dataloaders.sbd as sbd
from dataloaders import custom_transforms as tr
# from layers.loss import class_cross_entropy_loss 
from dataloaders.helpers import *
from networks.mainnetwork import *

# Set gpu_id to -1 to run in CPU mode, otherwise set the id of the corresponding gpu
gpu_id = 0
device = torch.device("cuda:"+str(gpu_id) if torch.cuda.is_available() else "cpu")
if torch.cuda.is_available():
    print('Using GPU: {} '.format(gpu_id))

# Setting parameters
resume_epoch = 1  # Default is 0, change if want to resume
nInputChannels = 5  # Number of input channels (RGB + heatmap of IOG points)

# Results and model directories (a new directory is generated for every run)
save_dir_root = os.path.join(os.path.dirname(os.path.abspath(__file__)))
exp_name = os.path.dirname(os.path.abspath(__file__)).split('/')[-1]
if resume_epoch == 0:
    runs = sorted(glob.glob(os.path.join(save_dir_root, 'run_*')))
    run_id = int(runs[-1].split('_')[-1]) + 1 if runs else 0
else:
    run_id = 0
save_dir = os.path.join(save_dir_root, 'run_' + str(run_id))
if not os.path.exists(os.path.join(save_dir, 'models')):
    os.makedirs(os.path.join(save_dir, 'models'))

# Network definition
modelName = 'IOG_pascal'
net = Network(nInputChannels=nInputChannels,num_classes=1,
                backbone='resnet101',
                output_stride=16,
                sync_bn=None,
                freeze_bn=False)

# load pretrain_dict
#pretrain_dict = torch.load(os.path.join(save_dir, 'models', modelName + '_epoch-' + str(resume_epoch - 1) + '.pth'))
#pretrain_dict=torch.load('/home/wsk/zsy/video_segmentation/interactivate_ablation_3point/expold6_res101_10k/run_0/models/dextr_pascal_epoch-79.pth')
pretrain_dict=torch.load('./dextr_pascal_epoch-89.pth')

state_dict = net.state_dict()
model_dict = state_dict

countt = 0
for k, v in pretrain_dict.items():
    k_list = k.split('.')
    if k_list[0] == 'global_net':
        kk = 'Coarse_net' + k[10:]
    elif k_list[0] == 'refine_net':
        kk = 'Fine_net' + k[10:]
    elif k_list[0] == 'ex_points':
        kk = 'iog_points.' + k[10:]
    else: 
        kk = k


    
    if kk in state_dict:
        model_dict[kk] = v
        #print(kk,model_dict[kk].shape,v.shape)
    else:
        print('skip',kk)
print(len(pretrain_dict.keys()) )
print(len(model_dict.keys()) )
state_dict.update(model_dict)
net.load_state_dict(state_dict)
#torch.save(net.state_dict(), '/home/wsk/zsy/IJCV/jiekou/release-model/IOG_pascal10k_epoch-79.pth')
torch.save(net.state_dict(), './IOG_pascal_sdb_epoch-89.pth')