# interactive-segmentation-editor
A web based interactive image annotation tool. We provide two possible instantiations of guidance, i.e., IOG-Click and IOG-Scribble. IOG-Click is based on [Inside-Outside-Guidance (IOG)](http://openaccess.thecvf.com/content_CVPR_2020/papers/Zhang_Interactive_Object_Segmentation_With_Inside-Outside_Guidance_CVPR_2020_paper.pdf) and the IOG-Scribble is an improved version, which represents the object-of-interest with a coarse scribble. 

![img](https://raw.githubusercontent.com/KunyangHan/interactive-segmentation-editor/master/doc/sheep.png "img")

### How to run
1. Install requirement  
  - [Meteor](http://www.meteor.com/install)
  - PyTorch = 0.4
  - python >= 3.5
  - torchvision = 0.2
  - pycocotools
  - 
2. Usage
```
sh run.sh

```
### How to use



### Demo

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

### Citations
Please consider citing our papers in your publications if it helps your research. The following is a BibTeX reference.

    @inproceedings{zhang2020interactive,
      title={Interactive Object Segmentation With Inside-Outside Guidance},
      author={Zhang, Shiyin and Liew, Jun Hao and Wei, Yunchao and Wei, Shikui and Zhao, Yao},
      booktitle={Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition},
      pages={12234--12244},
      year={2020}
    }
