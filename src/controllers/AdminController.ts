import { UserRepository } from "@/repositories/UserRepository";
import { UserPresenceRepository } from "@/repositories/UserPresenceRepository";
import type { UserSearchResultDTO } from "@/entities/User";

export class AdminController {
    constructor(
        private readonly userRepository: UserRepository = new UserRepository(),
        private readonly presenceRepository: UserPresenceRepository = new UserPresenceRepository()
    ) {}

    async getAllUsers(adminId: string): Promise<UserSearchResultDTO[]> {
        const adminUser = await this.userRepository.getUserInfo([adminId]);
        if (!adminUser || adminUser[0]?.role !== "ADMIN") {
            throw new Error("관리자 권한이 없습니다.");
        }

        const dbClient = (this.userRepository as any).constructor.db; 
        
        const { data: users, error } = await dbClient
            .from("User")
            .select("userId, studentId, name, universityName, role")
            .neq("role", "ADMIN"); 

        if (error) throw new Error(error.message);

        const targetUserIds = users.map((u: any) => u.userId);
        const onlineStatusMap = await this.presenceRepository.findOnlineStatusByUserIds(targetUserIds);

        return users.map((user: any) => ({
            userId: user.userId,
            studentId: user.studentId,
            name: user.name,
            universityName: user.universityName,
            isOnline: onlineStatusMap.get(user.userId) ?? false
        }));
    }

    async deleteUser(adminId: string, targetUserId: string): Promise<void> {
        const adminUser = await this.userRepository.getUserInfo([adminId]);
        if (!adminUser || adminUser[0]?.role !== "ADMIN") {
            throw new Error("관리자 권한이 없습니다.");
        }

        const dbClient = (this.userRepository as any).constructor.db;
        
        const { error } = await dbClient.from("User").delete().eq("userId", targetUserId);
        
        if (error) throw new Error("사용자 삭제 중 DB 오류가 발생했습니다.");
    }
}
