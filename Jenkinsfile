node('rhel7'){
    stage ('Checkout code'){
        deleteDir()
        git url: 'https://github.com/gorkem/che-priority-sheet.git'
    }
    stage ('install requirements'){
        def nodeHome = tool 'nodejs-7.7.4'
        env.PATH="${env.PATH}:${nodeHome}/bin"
        sh "npm install -g typescript@2.5.2"
    }

    stage ('build & run'){
        sh "npm install"
        sh "npm run build"
        withCredentials([file(credentialsId: 'che-priority-creds', variable: 'FILE')]) {
          sh 'npm run execute ${FILE}'
        }
    }
}
