import os
import json

class Path(object):
    @staticmethod
    def db_root_dir(database):
        if database == 'pascal':
            return '/home/zsy/program_zsy/data/voc/'
            #'/path/to/PASCAL/VOC2012'  # folder that contains VOCdevkit/.

        elif database == 'sbd':
            return '/path/to/SBD/'  # folder with img/, inst/, cls/, etc.
        else:
            print('Database {} not available.'.format(database))
            raise NotImplementedError

    @staticmethod
    def models_dir():
        return './resnet101-5d3b4d8f.pth'
        #'/path/to/models/resnet101-5d3b4d8f.pth'    
        #'resnet101-5d3b4d8f.pth' #resnet50-19c8e357.pth'

    @staticmethod
    def watch_dir():
        path_to_meteor = os.path.abspath("../meteor_server")
        with open(os.path.join(path_to_meteor, "settings.json")) as f:
            content = f.read()
        setting = json.loads(content)

        meteor_init_path = os.path.join(path_to_meteor, ".meteor/local/build/programs/server")
        image_path = os.path.abspath(os.path.join(meteor_init_path, setting['configuration']['images-folder']))
        other_path = os.path.abspath(os.path.join(meteor_init_path, setting['configuration']['base-folder']))

        return image_path, other_path