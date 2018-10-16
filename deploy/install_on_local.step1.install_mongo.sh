#!/usr/bin/env bash

export PLATFORM=$(python -c "import sys; print(sys.platform)")


if [ $PLATFORM = "darwin" ]; then

    echo "==== Installing mongo using brew ===="

    brew install mongo


elif [ $PLATFORM = "centos" ]; then

    echo "==== Installing mongo using yum ===="

    sudo tee /etc/yum.repos.d/mongodb-org-4.0.repo << EOM
[mongodb-org-4.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/4.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.0.asc
EOM

    sudo yum install update
    sudo yum install -y mongodb-org-4.0.3 mongodb-org-server-4.0.3 mongodb-org-shell-4.0.3 mongodb-org-mongos-4.0.3 mongodb-org-tools-4.0.3

    sudo service mongod start


elif [ $PLATFORM = "ubuntu" ]; then

    echo "==== Installing mongo using apt-get ===="

    sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
    echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
    sudo apt-get update

    sudo apt-get install -y mongodb-org=4.0.3 mongodb-org-server=4.0.3 mongodb-org-shell=4.0.3 mongodb-org-mongos=4.0.3 mongodb-org-tools=4.0.3

    sudo service mongod start

else
    echo "Unexpected operating system: $PLATFORM"
    exit 1;
fi;