trap "exit" INT TERM ERR
trap "kill 0" EXIT

if [ ! -d "work_folder/bgP_fgS" ]; then
    mkdir work_folder/bgP_fgS
fi
if [ ! -d "work_folder/bgP_fgP" ]; then
    mkdir work_folder/bgP_fgP
fi

cd python_script
python test_demo_mix.py >../python_output.out 2>&1 &
echo "Python script running with pid $!, check its output in './python_output.out' file."

cd ../meteor_server
meteor npm start