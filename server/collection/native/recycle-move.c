#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <limits.h>

static int open_directory(const char *path, const char *dev, const char *ino) {
    if (path[0] != '/' || strlen(path) >= PATH_MAX) return -1;
    char copy[PATH_MAX];
    strcpy(copy, path);
    int fd = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
    char *context, *part = strtok_r(copy, "/", &context);
    while (fd >= 0 && part) {
        if (!strcmp(part, ".") || !strcmp(part, "..")) { close(fd); return -1; }
        int next = openat(fd, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
        close(fd); fd = next; part = strtok_r(NULL, "/", &context);
    }
    struct stat st;
    if (fd < 0 || fstat(fd, &st) || !S_ISDIR(st.st_mode) ||
        (unsigned long long)st.st_dev != strtoull(dev, NULL, 10) ||
        (unsigned long long)st.st_ino != strtoull(ino, NULL, 10)) {
        if (fd >= 0) close(fd);
        return -1;
    }
    return fd;
}

int main(int argc, char **argv) {
    if (argc != 11 || !argv[3][0] || !argv[4][0] || strchr(argv[3], '/') ||
        strchr(argv[4], '/') || !strcmp(argv[3], ".") || !strcmp(argv[3], "..") ||
        !strcmp(argv[4], ".") || !strcmp(argv[4], "..")) return 64;
    int source = open_directory(argv[1], argv[7], argv[8]);
    int target = open_directory(argv[2], argv[9], argv[10]);
    struct stat st;
    if (source < 0 || target < 0 || fstatat(source, argv[3], &st, AT_SYMLINK_NOFOLLOW) ||
        !S_ISDIR(st.st_mode) ||
        (unsigned long long)st.st_dev != strtoull(argv[5], NULL, 10) ||
        (unsigned long long)st.st_ino != strtoull(argv[6], NULL, 10)) {
        if (source >= 0) close(source);
        if (target >= 0) close(target);
        fprintf(stderr, "directory identity changed\n"); return 65;
    }
    int result = renameatx_np(source, argv[3], target, argv[4], RENAME_EXCL);
    int reason = errno;
    close(source); close(target);
    if (result) { fprintf(stderr, "errno:%d\n", reason); return 66; }
    return 0;
}
