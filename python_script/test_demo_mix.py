import os
import time
import imageio
from urllib.parse import unquote
from shutil import copyfile
import scipy.misc as sm
from collections import OrderedDict
import glob

# Custom includes
from dataloaders.combine_dbs import CombineDBs as combine_dbs
import dataloaders.pascal as pascal
from dataloaders import custom_transforms as tr
from dataloaders.helpers import *
import dataloaders.helpers as helpers
from PIL import Image
from mypath import Path
# PyTorch includes
import torch.optim as optim
from torchvision import transforms
from torch.utils.data import DataLoader
from torch.nn.functional import upsample
from networks.mainnetwork import *

import torch
import numpy as np

def make_gt_scribble(img, labels,_scribble, sigma=10, one_mask_per_point=False):
    """ Make the ground-truth for  landmark.
    img: the original color image
    labels: label with the Gaussian center(s) [[x0, y0],[x1, y1],...]
    sigma: sigma of the Gaussian.
    one_mask_per_point: masks for each point in different channels?
    """
    h, w = img.shape[:2]
    if labels is None:
        gt = make_gaussian((h, w), center=(h//2, w//2), sigma=sigma)
        gt_0 = np.zeros(shape=(h, w), dtype=np.float64)
        gt_0 = gt
        gt_1 = np.zeros(shape=(h, w), dtype=np.float64)
        
        gtout = np.zeros(shape=(h, w, 2))
        gtout[:, :, 0]=gt_0
        gtout[:, :, 1]=gt_1
        gtout = gtout.astype(dtype=img.dtype) #(0~1)        
        return gtout
    else:
        labels = np.array(labels)
        if labels.ndim == 1:
            labels = labels[np.newaxis]
        
            gt_0 = np.zeros(shape=(h, w), dtype=np.float64)
            gt_1 = np.zeros(shape=(h, w), dtype=np.float64)
            gt_0 = np.maximum(gt_0, make_gaussian((h, w), center=labels[0, :], sigma=sigma))
           
        else:   
            gt_1 = np.zeros(shape=(h, w), dtype=np.float64)
            for ii in range(0,labels.shape[0]):
                gt_1 = np.maximum(gt_1, make_gaussian((h, w), center=labels[ii, :], sigma=sigma))

            gt_0 = img*_scribble
            gt_0 = (gt_0>0.5)*1
           
    gt = np.zeros(shape=(h, w, 2))
    gt[:, :, 0]=gt_0
    gt[:, :, 1]=gt_1
    gt = gt.astype(dtype=img.dtype) #(0~1)
    return gt 


def GetDistanceMap_scribble(mask,pad_pixel):
    def find_point(id_x, id_y, ids):
        sel_id = ids[0][random.randint(0, len(ids[0]) - 1)]
        return [id_x[sel_id], id_y[sel_id]]
    #generate bg point
    inds_y, inds_x = np.where(mask > 0.5)   
    [h,w]=mask.shape 
    left = find_point(inds_x, inds_y, np.where(inds_x <= np.min(inds_x))) # left
    right = find_point(inds_x, inds_y, np.where(inds_x >= np.max(inds_x))) # right
    top = find_point(inds_x, inds_y, np.where(inds_y <= np.min(inds_y))) # top
    bottom = find_point(inds_x, inds_y, np.where(inds_y >= np.max(inds_y))) # bottom  
    x_min=left[0]
    x_max=right[0]
    y_min=top[1]
    y_max=bottom[1]                          
    left_top=[max(x_min-pad_pixel,0),  max(y_min-pad_pixel,0)]
    left_bottom=[max(x_min-pad_pixel ,0),     min(y_max+pad_pixel,h)]
    right_top=[min(x_max+pad_pixel,w),          max(y_min-pad_pixel,0)]
    righr_bottom=[min(x_max+pad_pixel ,w),    min(y_max+pad_pixel,h)]      
    a=[left_top,left_bottom,right_top,righr_bottom]  
    return np.array(a)

def GetDistanceMap_click(mask,cp,pad_pixel):
    def find_point(id_x, id_y, ids):
        sel_id = ids[0][random.randint(0, len(ids[0]) - 1)]
        return [id_x[sel_id], id_y[sel_id]]
    #generate bg point
    inds_y, inds_x = np.where(mask > 0.5)   
    [h,w]=mask.shape 
    left = find_point(inds_x, inds_y, np.where(inds_x <= np.min(inds_x))) # left
    right = find_point(inds_x, inds_y, np.where(inds_x >= np.max(inds_x))) # right
    top = find_point(inds_x, inds_y, np.where(inds_y <= np.min(inds_y))) # top
    bottom = find_point(inds_x, inds_y, np.where(inds_y >= np.max(inds_y))) # bottom  
    x_min=left[0]
    x_max=right[0]
    y_min=top[1]
    y_max=bottom[1]                          
    left_top=[max(x_min-pad_pixel,0),  max(y_min-pad_pixel,0)]
    left_bottom=[max(x_min-pad_pixel ,0),     min(y_max+pad_pixel,h)]
    right_top=[min(x_max+pad_pixel,w),          max(y_min-pad_pixel,0)]
    righr_bottom=[min(x_max+pad_pixel ,w),    min(y_max+pad_pixel,h)]
     
    #generate center point           
    cpinds_y, cpinds_x = np.where(cp > 0.5)   
    try:
        cpbottom = find_point(cpinds_x, cpinds_y, np.where(cpinds_y >= np.max(cpinds_y))) # bottom  
        cpright = find_point(cpinds_x, cpinds_y, np.where(cpinds_x >= np.max(cpinds_x))) # right
        cpx_max=cpright[0]
        cpy_max=cpbottom[1]
        center_point=[cpx_max,cpy_max]  
    except:
        cpx_max=int((x_min+x_max)/2)
        cpy_max=int((y_min+y_max)/2)
        center_point=[cpx_max,cpy_max]  
          
    a=[center_point,left_top,left_bottom,right_top,righr_bottom]  
    return np.array(a)


def get_distancemap(sigma, elem, elem_inside,use_scribble,pad_pixel):
    _target = elem
    targetshape=_target.shape
    if use_scribble:
        _scribble = elem_inside
        if np.max(_target) == 0:
            distancemap = np.zeros([targetshape[0],targetshape[1],2], dtype=_target.dtype) #  TODO: handle one_mask_per_point case
        else:
            _points = GetDistanceMap_scribble(_target, pad_pixel)        
            distancemap = make_gt_scribble(_target, _points, _scribble,sigma=sigma, one_mask_per_point=False)
    else:
        _cp = elem_inside
        if np.max(_target) == 0:
            distancemap = np.zeros([targetshape[0],targetshape[1],2], dtype=_target.dtype) #  TODO: handle one_mask_per_point case
        else:
            _points = GetDistanceMap_click(_target, _cp, pad_pixel)        
            distancemap = make_gt(_target, _points, sigma=sigma, one_mask_per_point=False)
    custom_max=255.
    tmp = distancemap
    tmp = custom_max * (tmp - tmp.min()) / (tmp.max() - tmp.min() + 1e-10)
    return tmp


def totensor(tmp):
    if tmp.ndim == 2:
        tmp = tmp[:, :, np.newaxis]
    tmp = tmp.transpose((2, 0, 1))
    tmp = tmp[np.newaxis, :, :]
    tmp= torch.from_numpy(tmp)
    return tmp
    
def getbg(bgx,bgy,bgyw,bgyh,w,h):
    _bg = np.zeros((w,h)) 
    _bg[bgx:bgx+bgyw,bgy:bgy+bgyh] = 1
    _bg = _bg.astype(np.float32)   
    return _bg
    
def getcp(cx,cy,w,h):
    _cp = np.zeros((w,h)) 
    _cp[:cy,:cx] = 1
    _cp = _cp.astype(np.float32)  
    return _cp

def loadnetwork(model_name='IOG_PASCAL.pth'):
    # Set gpu_id to -1 to run in CPU mode, otherwise set the id of the corresponding gpu
    gpu_id = 0
    device = torch.device("cuda:"+str(gpu_id) if torch.cuda.is_available() else "cpu")
    if torch.cuda.is_available():
        print('Initial the IOG using GPU: {} '.format(gpu_id))
    
    # Setting parameters
    resume_epoch = 80  # Default is 0, change if want to resume
    nInputChannels = 5  # Number of input channels (RGB + heatmap of extreme points)
 
    # Results and model directories (a new directory is generated for every run)
    save_dir_root = os.path.join(os.path.dirname(os.path.abspath(__file__)))
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
    #load models
    #pretrain_dict=torch.load(os.path.join(save_dir, 'models', modelName + '_epoch-' + str(resume_epoch - 1) + '.pth'))
    pretrain_dict=torch.load(os.path.join(save_dir, 'models', model_name))
    net_dict=net.state_dict()
    for k, v in pretrain_dict.items():  
        if k in net_dict:      
            net_dict[k] = v
        else:
            print('skil parameters:',k)

    net.load_state_dict(net_dict)
    net.to(device)
    net.eval()
    print('end')
    return net
    
def IOG_getmask(bgpoint,inside,image,net,use_scribble=False):    
    with torch.no_grad():
        gpu_id = 0
        device = torch.device("cuda:"+str(gpu_id) if torch.cuda.is_available() else "cpu")
        w,h,channel =image.shape
        bgx = bgpoint[0]
        bgy = bgpoint[1]
        bgyw = bgpoint[2]-bgx
        bgyh = bgpoint[3]-bgy       
        bg = getbg(bgy,bgx,bgyh,bgyw,w,h)          
        crop_image = crop_from_mask(image, bg, relax=30, zero_pad=True)
        crop_bg = crop_from_mask(bg, bg, relax=30, zero_pad=True)  
        crop_image = fixed_resize(crop_image, (512,512) )
        crop_bg = fixed_resize(crop_bg, (512,512) )   

        if use_scribble:

            crop_scribble = crop_from_mask(inside, bg, relax=30, zero_pad=True)
            crop_scribble = fixed_resize(crop_scribble, (512,512) )
            distancemap =  get_distancemap(sigma=10,elem=crop_bg,elem_inside=crop_scribble,use_scribble = use_scribble,pad_pixel=10)    
        else:
            cx = inside[0]
            cy = inside[1]
            cp = getcp(cx,cy,w,h) 
            crop_cp = crop_from_mask(cp, bg, relax=30, zero_pad=True)
            crop_cp = fixed_resize(crop_cp, (512,512) )
            distancemap =  get_distancemap(sigma=10,elem=crop_bg,elem_inside=crop_cp,use_scribble = use_scribble,pad_pixel=10)    
    
        distancemap = totensor(distancemap)
        crop_image = totensor(crop_image)
        distancemap = distancemap.float()
        crop_image = crop_image.float()
        
        inputs=torch.cat([crop_image,distancemap],1)                
        inputs = inputs.to(device)
        glo1,glo2,glo3,glo4,refine= net.forward(inputs)  
        output_refine = upsample(refine, size=(512, 512), mode='bilinear', align_corners=True)
        
        #generate result
        jj=0  
        outputs = output_refine.to(torch.device('cpu'))
        pred = np.transpose(outputs.data.numpy()[jj, :, :, :], (1, 2, 0))
        pred = 1 / (1 + np.exp(-pred))
        pred = np.squeeze(pred)
        gt = bg 
        bbox = get_bbox(gt, pad=30, zero_pad=True)
        result = crop2fullmask(pred, bbox, gt, zero_pad=True, relax=0,mask_relax=False)
        # 0~1
        resultmax,resultmin = result.max(),result.min()
        result = (result-resultmin)/(resultmax-resultmin)
        result = (result>0.3)*255
        # cp = cp.astype(np.uint8)
#        sm.imsave('result.png' , result)
    return result 


def pred_click(imgg_name, bgpoint, cppoint, zero_pad=True, relax=30):
    ########## load point txt
    # bgpoint = [0,100,500,266]
    # cppoint = [250,183]
    model_name = 'IOG_PASCAL.pth'
    ##########

    img_name_strip = imgg_name[0 : imgg_name.rfind('.')]
    imgg_dir = os.path.join(path_to_image, imgg_name)
    image = np.array(Image.open(imgg_dir).convert('RGB')).astype(np.float32)
    result = IOG_getmask(bgpoint,cppoint,image,loadnetwork(model_name),False)   
    save_path = os.path.join(path_to_watch,  'mask',  img_name_strip + '.jpg')
    imageio.imwrite(save_path, result)
    # imageio.imwrite('results_adaptive.jpg', result)

    return True


def pred_scribble(imgg_name, bgpoint, zero_pad=True, relax=30):
    ##########
    # bgpoint = [0,100,500,266]
    model_name = 'IOG_PASCAL.pth'
    # model_name = 'IOG_PASCAL_scribble.pth'
    ##########

    img_name_strip = imgg_name[0 : imgg_name.rfind('.')]
    scribble_dir = os.path.join(path_to_watch,  'scribble',  img_name_strip + '_fg_scribble.png')
    # scribble_dir = '2007_001284_fg_scribble.png'
    _scribble = np.array(Image.open(scribble_dir)).astype(np.float32)
    _scribble[_scribble > 5] = 255
    _scribble = _scribble[:,:,0]
    _scribble = (_scribble>=1)*1

    imgg_dir = os.path.join(path_to_image, imgg_name)
    image = np.array(Image.open(imgg_dir).convert('RGB')).astype(np.float32)
    result = IOG_getmask(bgpoint,_scribble,image,loadnetwork(model_name),True)   
    save_path = os.path.join(path_to_watch,  'mask',  img_name_strip + '.jpg')
    imageio.imwrite(save_path, result)
    # imageio.imwrite('results_adaptive_v2.jpg', result)

    return True


def oneTurn_s(f, bgpoint):
    name = unquote(f[:f.rfind('.')])
    # print(bgpoint)
    bgpoint = [int(float(i)) for i in bgpoint]

    return pred_scribble(name, bgpoint)


def oneTurn_c(f, bgpoint, cppoint):
    name = unquote(f[:f.rfind('.')])
    bgpoint = [int(float(i)) for i in bgpoint]
    cppoint = [int(float(i)) for i in cppoint]

    return pred_click(name, bgpoint, cppoint)


def run():
    print('waiting', time.time())
    while 1:
        input_folder = os.path.join(path_to_watch, "bgP_fgP/")
        files = os.listdir(input_folder)
        for f in files:
            print('find points:', f, time.time())
            with open(os.path.join(input_folder, f)) as points:
                content = points.read()
            content = content.split(",")
            bgpoint = content[:4]
            cppoint = content[4:]

            if oneTurn_c(f, bgpoint, cppoint):
                # delete file
                os.remove(os.path.join(input_folder, f))
        time.sleep(0.1)

        input_folder = os.path.join(path_to_watch, "bgP_fgS/")
        files = os.listdir(input_folder)
        for f in files:
            print('find points:', f, time.time())
            with open(os.path.join(input_folder, f)) as points:
                content = points.read()
            bgpoint = content.split(",")[:4]

            if oneTurn_s(f, bgpoint):
                # delete file
                os.remove(os.path.join(input_folder, f))
        time.sleep(0.1)


def test():
    files = os.listdir(os.path.join(path_to_watch, "bgP_fgS/"))
    for f in files:
        print('find points:', f, time.time())
        with open(os.path.join(input_folder, f)) as points:
            content = points.read()
        bgpoint = content.split(",")[:4]

        oneTurn_s(f, bgpoint)


print('Testing Network')

path_to_image, path_to_watch = Path.watch_dir()

if __name__ == "__main__":
    print(path_to_image, path_to_watch)
    run()