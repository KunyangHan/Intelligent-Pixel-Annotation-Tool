# interactive-segmentation-editor
A web based interactive image annotation tool. 

<div>
<img src="https://raw.githubusercontent.com/KunyangHan/interactive-segmentation-editor/master/doc/show.pdf" height="330" width="700" >
</div>
 
 
## Abstract
We provide two possible instantiations of guidance, i.e., IOG-Click and IOG-Scribble. IOG-Click is based on [Inside-Outside-Guidance (IOG)](http://openaccess.thecvf.com/content_CVPR_2020/papers/Zhang_Interactive_Object_Segmentation_With_Inside-Outside_Guidance_CVPR_2020_paper.pdf) and the IOG-Scribble is an improved version, which represents the object-of-interest with a coarse scribble. We also prorose superpixel tool for user refinement.

## How to use
### 1. Install requirement  

#### Python requirement
  - PyTorch = 0.4
  - python >= 3.5
  - torchvision = 0.2
  - pycocotools  

#### Server requirement
  - Install [Meteor](http://www.meteor.com/install)
  - Install npm package:
 
	``` shell
    cd ./meteor_server
    meteor npm install
	```

### 2. Usage
  - Download the pretrained models form [IOG](https://github.com/shiyinzhang/Inside-Outside-Guidance) and copy the models to <code>/path/to/interactive-segmentation-editor/python_script/</code>. We also propose the pretrained models of [IOG-Scribble](https://drive.google.com/file/d/1SKBgkcouwEHBJLVK4g7RU21b6egAR_8M/view?usp=sharing). 
  - (Optional) Copy images (.jpg or .png) to <code>/path/to/interactive-segmentation-editor/work_folder/image/</code> and update <code>/path/to/interactive-segmentation-editor/work_folder/imageList.txt</code>.
  - Then start the interactive segmentation editor with the following commands:
 
	``` shell
	sh run.sh
	```
  - The output mask directory: <code>/path/to/interactive-segmentation-editor/work_folder/annotate</code>

### 3. Support
  - Mouse wheel: Zoom in/out
  - Holding right mouse button: Drag image
  - Ctrl+Z : Undo 
  - Image Jumper: Input the index of image (imageList.txt) and load the image.
  
## Demo

<table>
    <tr>
        <td width="50%">
	<img src="https://raw.githubusercontent.com/KunyangHan/interactive-segmentation-editor/master/doc/IOG-Click.gif"/>
        </td>   
        <td width="50%">
	<img src="https://raw.githubusercontent.com/KunyangHan/interactive-segmentation-editor/master/doc/IOG-Scribble.gif"/>
        </td> 
    </tr>
    <tr>
        <td width="50%" align="center">
	IOG-Click
        </td>   
        <td width="50%" align="center">
	IOG-Scribble
        </td> 
    </tr>
</table>

## Citations
Please consider citing our papers in your publications if it helps your research. The following is a BibTeX reference.

    @inproceedings{zhang2020interactive,
      title={Interactive Object Segmentation With Inside-Outside Guidance},
      author={Zhang, Shiyin and Liew, Jun Hao and Wei, Yunchao and Wei, Shikui and Zhao, Yao},
      booktitle={Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition},
      pages={12234--12244},
      year={2020}
    }
